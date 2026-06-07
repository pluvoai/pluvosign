// Minimal "Source code" link for pages that do not render the full Footer
// (the guest / signing pages). AGPL §13 — users interacting with the program
// over a network must be offered its Corresponding Source. Fixed-position so
// it can be dropped into any page without affecting layout.
const SourceLink = () => (
  <a
    href="https://github.com/pluvoai/pluvosign"
    target="_blank"
    rel="noopener"
    className="fixed bottom-1 left-2 z-50 text-[11px] opacity-50 hover:opacity-90 hover:underline text-base-content"
  >
    Source code
  </a>
);

export default SourceLink;
