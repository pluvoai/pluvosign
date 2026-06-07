import React from "react";
import { isDemoHost } from "../utils/demoMode";

// Top-of-page banner shown only on the configured demo hostname.
// Inert on every other deployment (see utils/demoMode.js).
const DemoBanner = () => {
  if (!isDemoHost()) return null;
  return (
    <div
      role="status"
      className="w-full bg-amber-100 text-amber-900 text-[12.5px] leading-snug py-2 px-4 text-center border-b border-amber-300"
    >
      <strong>Demo environment.</strong>&nbsp; Accounts and documents are
      deleted 14 days after signup. You can send up to 20 signing requests per
      day, only to your own email address. Please don&apos;t upload sensitive
      material.
    </div>
  );
};

export default DemoBanner;
