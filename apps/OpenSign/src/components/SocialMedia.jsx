import React from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

const SocialMedia = () => {
  const { t } = useTranslation();

  return (
    <React.Fragment>
      <NavLink
        to="https://www.linkedin.com/company/pluvoai/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <i aria-hidden="true" className="fa-brands fa-linkedin"></i>
        <span className="fa-sr-only">
          Pluvo AI&apos;s {t("social-media.linked-in")}
        </span>
      </NavLink>
    </React.Fragment>
  );
};

export default SocialMedia;
