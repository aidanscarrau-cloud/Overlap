// Shown instantly while a page loads, so taps feel immediate.
export default function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <div className="skel-block" style={{ height: 44, width: "40%" }} />
      <div className="skel-block" style={{ height: 160 }} />
      <div className="skel-row">
        <div className="skel-block" />
        <div className="skel-block" />
        <div className="skel-block" />
      </div>
    </div>
  );
}
