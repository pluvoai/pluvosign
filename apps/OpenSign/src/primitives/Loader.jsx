import React from "react";
import pluvoIcon from "../assets/images/pluvo-icon.png";

// Branded loading indicator — a brand icon with a gentle CSS pulse
// (keyframes `pluvo-loader` in index.css). No animated asset needed.
//
// Part of the per-deployment branding: it uses the tenant's favicon (set
// per client via set-branding.sh, cached in localStorage by getAppLogo) so
// a white-label client's loader shows THEIR icon. Falls back to the bundled
// Pluvo icon when no per-client favicon is available yet.
const Loader = () => {
  let icon = pluvoIcon;
  try {
    const stored = localStorage.getItem("favicon");
    if (stored) icon = stored;
  } catch {
    /* localStorage unavailable — keep the bundled icon */
  }
  return (
    <img
      src={icon}
      alt="Loading"
      className="pluvo-loader w-16 h-auto select-none"
      draggable="false"
    />
  );
};

export default Loader;
