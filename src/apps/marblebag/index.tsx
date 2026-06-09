import TheBag from "./TheBag.jsx";

// Marblebag relies on the SuperApp's Google allow-list as its sole gate —
// anyone who can sign in to SuperApp can open it. The /marblebag route is
// still unlisted (no Dashboard tile) per KICKOFF.md, just no longer
// password-gated. TheBag is a full-screen, inline-styled experience with its
// own theming, so we break it out of the shell's centered container.
export default function Marblebag() {
  return (
    <div className="-mx-4 -mt-4">
      <TheBag />
    </div>
  );
}
