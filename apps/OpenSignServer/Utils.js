import dotenv from 'dotenv';
import { format, toZonedTime } from 'date-fns-tz';
import getPresignedUrl, { getSignedLocalUrl } from './cloud/parsefunction/getSignedUrl.js';
import crypto from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import { parseUploadFile } from './utils/fileUtils.js';

dotenv.config({ quiet: true });

export const cloudServerUrl = 'http://localhost:8080/app';
export const serverAppId = process.env.APP_ID || 'opensign';
export const appName = process.env.appName || 'PluvoSign';
export const prefillDraftDocWidget = ['date', 'textbox', 'checkbox', 'radio button', 'image'];
export const prefillDraftTemWidget = [
  'date',
  'textbox',
  'checkbox',
  'radio button',
  'image',
  'dropdown',
];
export const MAX_NAME_LENGTH = 250;
export const MAX_NOTE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 500;
export const color = [
  '#93a3db',
  '#e6c3db',
  '#c0e3bc',
  '#bce3db',
  '#b8ccdb',
  '#ceb8db',
  '#ffccff',
  '#99ffcc',
  '#cc99ff',
  '#ffcc99',
  '#66ccff',
  '#ffffcc',
];

export const prefillBlockColor = 'transparent';
export function replaceMailVaribles(subject, body, variables) {
  let replacedSubject = subject;
  let replacedBody = body;

  for (const variable in variables) {
    const regex = new RegExp(`{{${variable}}}`, 'g');
    if (subject) {
      replacedSubject = replacedSubject.replace(regex, variables[variable]);
    }
    if (body) {
      replacedBody = replacedBody.replace(regex, variables[variable]);
    }
  }
  const result = { subject: replacedSubject, body: replacedBody };
  return result;
}

export const saveFileUsage = async (size, fileUrl, userId) => {
  //checking server url and save file's size
  try {
    if (userId) {
      const userPtr = { __type: 'Pointer', className: '_User', objectId: userId };
      const tenantQuery = new Parse.Query('partners_Tenant');
      tenantQuery.equalTo('UserId', userPtr);
      const tenant = await tenantQuery.first({ useMasterKey: true });
      if (tenant) {
        const tenantPtr = { __type: 'Pointer', className: 'partners_Tenant', objectId: tenant.id };
        try {
          const tenantCredits = new Parse.Query('partners_TenantCredits');
          tenantCredits.equalTo('PartnersTenant', tenantPtr);
          const res = await tenantCredits.first({ useMasterKey: true });
          if (res) {
            const response = JSON.parse(JSON.stringify(res));
            const usedStorage = response?.usedStorage ? response.usedStorage + size : size;
            const updateCredit = new Parse.Object('partners_TenantCredits');
            updateCredit.id = res.id;
            updateCredit.set('usedStorage', usedStorage);
            await updateCredit.save(null, { useMasterKey: true });
          } else {
            const newCredit = new Parse.Object('partners_TenantCredits');
            newCredit.set('usedStorage', size);
            newCredit.set('PartnersTenant', tenantPtr);
            await newCredit.save(null, { useMasterKey: true });
          }
        } catch (err) {
          console.log('err in save usage', err);
        }
        saveDataFile(size, fileUrl, tenantPtr, userPtr);
      }
    }
  } catch (err) {
    console.log('err in fetch tenant Id', err);
  }
};

//function for save fileUrl and file size in particular client db class partners_DataFiles
const saveDataFile = async (size, fileUrl, tenantPtr, UserId) => {
  try {
    const newDataFiles = new Parse.Object('partners_DataFiles');
    newDataFiles.set('FileUrl', fileUrl);
    newDataFiles.set('FileSize', size);
    newDataFiles.set('TenantPtr', tenantPtr);
    newDataFiles.set('UserId', UserId);
    await newDataFiles.save(null, { useMasterKey: true });
  } catch (err) {
    console.log('error in save usage ', err);
  }
};

export const updateMailCount = async extUserId => {
  // Update count in contracts_Users class
  const query = new Parse.Query('contracts_Users');
  query.equalTo('objectId', extUserId);

  try {
    const contractUser = await query.first({ useMasterKey: true });
    if (contractUser) {
      const _extRes = JSON.parse(JSON.stringify(contractUser));
      contractUser.increment('EmailCount', 1);
      await contractUser.save(null, { useMasterKey: true });
    }
  } catch (error) {
    console.log('Error updating EmailCount in contracts_Users: ' + error.message);
  }
};

export function sanitizeFileName(fileName) {
  // Remove spaces and invalid characters
  const file = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  const removedot = file.replace(/\.(?=.*\.)/g, '');
  return removedot.replace(/[^a-zA-Z0-9._-]/g, '');
}

export const useLocal = process.env.USE_LOCAL ? process.env.USE_LOCAL.toLowerCase() : 'false';
export const smtpsecure = process.env.SMTP_PORT && process.env.SMTP_PORT !== '465' ? false : true;
export const smtpenable =
  process.env.SMTP_ENABLE && process.env.SMTP_ENABLE.toLowerCase() === 'true' ? true : false;
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `generateId` is used to unique Id for fileAdapter
export function generateId(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * FlattenPdf is used to remove existing widgets if present any and flatten pdf.
 * @param {string | Uint8Array | ArrayBuffer} pdfFile - pdf file.
 * @returns {Promise<Uint8Array>} flatPdf - pdf file in unit8arry
 */
export const flattenPdf = async pdfFile => {
  try {
    const pdfDoc = await PDFDocument.load(pdfFile);
    // Get the form
    const form = pdfDoc.getForm();
    // fetch form fields
    const fields = form.getFields();
    // remove form all existing fields and their widgets
    if (fields && fields?.length > 0) {
      try {
        for (const field of fields) {
          while (field.acroField.getWidgets().length) {
            field.acroField.removeWidget(0);
          }
          form.removeField(field);
        }
      } catch (err) {
        console.log('err while removing field from pdf', err);
      }
    }
    // Updates the field appearances to ensure visual changes are reflected.
    form.updateFieldAppearances();
    // Flattens the form, converting all form fields into non-editable, static content
    form.flatten();
    const flatPdf = await pdfDoc.save({ useObjectStreams: false });
    return flatPdf;
  } catch (err) {
    console.log('err ', err);
    throw new Error('error in pdf');
  }
};

// Format date and time for the selected timezone
export const formatTimeInTimezone = (date, timezone) => {
  const nyDate = timezone && toZonedTime(date, timezone);
  const generatedDate = timezone
    ? format(nyDate, 'EEE, dd MMM yyyy HH:mm:ss zzz', { timeZone: timezone })
    : new Date(date).toUTCString();
  return generatedDate;
};

// `getSecureUrl` is used to return local secure url if local files
export const getSecureUrl = url => {
  const fileUrl = new URL(url)?.pathname?.includes('files');
  if (fileUrl) {
    try {
      const file = getSignedLocalUrl(url);
      if (file) {
        return { url: file };
      } else {
        return { url: '' };
      }
    } catch (err) {
      console.log('err while fileupload ', err);
      return { url: '' };
    }
  } else {
    return { url: url };
  }
};

export const mailTemplate = param => {
  const subject = `${param.senderName} has requested you to sign "${param.title}"`;
  const AppName = appName;
  const baseUrl = process.env.PUBLIC_URL || 'https://sign.pluvoai.com';
  const logoUrl = `${baseUrl}/pluvosign-logo.png`;
  const noteRow = param.note
    ? `<tr><td style="padding:6px 0;font-size:13px;color:#7b8794;">Note</td><td style="padding:6px 0;font-size:13px;color:#1f2a37;font-weight:600;">${param.note}</td></tr>`
    : '';

  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html;charset=UTF-8"></head><body style="margin:0;padding:0;background-color:#eef1f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e3e7ec;border-radius:12px;">
<tr><td align="center" style="padding:40px 40px 20px 40px;"><img src="${logoUrl}" alt="${AppName}" height="48" style="display:block;height:48px;width:auto;"></td></tr>
<tr><td style="padding:0 40px;"><div style="height:3px;background-color:#3E8FCB;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:32px 40px 0 40px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<h1 style="margin:0 0 18px 0;font-size:23px;line-height:1.3;color:#1f2a37;font-weight:600;">Signature requested</h1>
<p style="margin:0 0 26px 0;font-size:15px;line-height:1.65;color:#42505f;"><strong style="color:#1f2a37;">${param.senderName}</strong> has requested your signature on <strong style="color:#1f2a37;">${param.title}</strong>. Please review the document and sign at your earliest convenience.</p>
</td></tr>
<tr><td style="padding:0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7f9;border:1px solid #e7ebef;border-radius:8px;"><tr><td style="padding:18px 22px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:6px 0;font-size:13px;color:#7b8794;width:130px;">From</td><td style="padding:6px 0;font-size:13px;color:#1f2a37;font-weight:600;">${param.senderName} &middot; ${param.senderMail}</td></tr>
<tr><td style="padding:6px 0;font-size:13px;color:#7b8794;">Organization</td><td style="padding:6px 0;font-size:13px;color:#1f2a37;font-weight:600;">${param.organization}</td></tr>
<tr><td style="padding:6px 0;font-size:13px;color:#7b8794;">Expires</td><td style="padding:6px 0;font-size:13px;color:#1f2a37;font-weight:600;">${param.localExpireDate}</td></tr>
${noteRow}
</table>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:30px 40px 6px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="background-color:#3E8FCB;border-radius:6px;">
<a href="${param.signingUrl}" target="_blank" style="display:inline-block;padding:15px 46px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Review &amp; Sign</a>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:6px 40px 34px 40px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9aa5b1;">Button not working? Copy and paste this link into your browser:<br><span style="color:#3E8FCB;word-break:break-all;">${param.signingUrl}</span></td></tr>
<tr><td style="padding:0 40px;"><div style="border-top:1px solid #e7ebef;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:22px 40px 34px 40px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#9aa5b1;">This is an automated message from ${AppName}. For any questions about this document, please contact the sender directly.</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#9aa5b1;">This email and the linked document are confidential and intended solely for the named recipient.</p>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:22px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#9aa5b1;">&copy; ${new Date().getFullYear()} Pluvo AI Consulting &nbsp;&middot;&nbsp; Secure document signing</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject, body };
};

export const selectFormat = data => {
  switch (data) {
    case 'L':
      return 'MM/dd/yyyy';
    case 'MM/DD/YYYY':
      return 'MM/dd/yyyy';
    case 'DD-MM-YYYY':
      return 'dd-MM-yyyy';
    case 'DD/MM/YYYY':
      return 'dd/MM/yyyy';
    case 'LL':
      return 'MMMM dd, yyyy';
    case 'DD MMM, YYYY':
      return 'dd MMM, yyyy';
    case 'YYYY-MM-DD':
      return 'yyyy-MM-dd';
    case 'MM-DD-YYYY':
      return 'MM-dd-yyyy';
    case 'MM.DD.YYYY':
      return 'MM.dd.yyyy';
    case 'MMM DD, YYYY':
      return 'MMM dd, yyyy';
    case 'MMMM DD, YYYY':
      return 'MMMM dd, yyyy';
    case 'DD MMMM, YYYY':
      return 'dd MMMM, yyyy';
    case 'DD.MM.YYYY':
      return 'dd.MM.yyyy';
    case 'DD-MMM-YYYY':
      return 'dd-MMM-yyyy';
    default:
      return 'MM/dd/yyyy';
  }
};

export function formatDateTime(date, dateFormat, timeZone, is12Hour) {
  const zonedDate = toZonedTime(date, timeZone); // Convert date to the given timezone
  const timeFormat = is12Hour ? 'hh:mm:ss a' : 'HH:mm:ss';
  return dateFormat
    ? format(zonedDate, `${selectFormat(dateFormat)}, ${timeFormat} 'GMT' XXX`, { timeZone })
    : formatTimeInTimezone(date, timeZone);
}
export const randomId = () => {
  const randomBytes = crypto.getRandomValues(new Uint16Array(1));
  const randomValue = randomBytes[0];
  const randomDigit = 1000 + (randomValue % 9000);
  return randomDigit;
};

export const handleValidImage = async Placeholder => {
  const updatedPlaceholders = [];

  for (const placeholder of Placeholder || []) {
    //Clean and format signerPtr
    let signerPtr = placeholder.signerPtr;
    // Check if signerPtr exists and has an id
    if (signerPtr?.id) {
      // Case 1: If signerPtr is a Parse Object instance
      if (signerPtr instanceof Parse.Object) {
        // If signerPtr has no attributes, it’s a plain pointer already
        if (!signerPtr.attributes || Object.keys(signerPtr.attributes).length === 0) {
          // Convert to a clean pointer using Parse’s built-in method
          signerPtr = signerPtr.toPointer();
        } else {
          // If it has attributes, manually construct the pointer object
          signerPtr = {
            __type: 'Pointer',
            className: signerPtr.className,
            objectId: signerPtr.id,
          };
        }
        // Case 2: If signerPtr is already a plain JS object resembling a pointer
      } else if (typeof signerPtr === 'object' && signerPtr.className && signerPtr.objectId) {
        // Normalize it to a valid Parse pointer object
        signerPtr = {
          __type: 'Pointer',
          className: signerPtr.className,
          objectId: signerPtr.objectId,
        };
      }
    }

    //Process placeHolder if Role is 'prefill'
    if (placeholder?.Role === 'prefill') {
      const updatedRole = [];
      for (const item of placeholder.placeHolder || []) {
        const updatedPos = [];
        for (const posItem of item.pos || []) {
          if (
            (posItem?.type === 'image' || posItem?.type === 'draw') &&
            posItem?.options?.response
          ) {
            const validUrl = await getPresignedUrl(posItem?.options?.response);
            updatedPos.push({
              ...posItem,
              ...(item.SignUrl !== undefined && { SignUrl: validUrl }),
              options: { ...posItem.options, response: validUrl },
            });
          } else {
            updatedPos.push(posItem);
          }
        }
        updatedRole.push({ ...item, pos: updatedPos });
      }

      updatedPlaceholders.push({ ...placeholder, signerPtr, placeHolder: updatedRole });
    } else {
      // Not prefill role, just push as-is
      updatedPlaceholders.push({ ...placeholder, signerPtr });
    }
  }
  return updatedPlaceholders;
};
