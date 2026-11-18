// Shown instantly while a page loads, so taps feel immediate: the shape of the page, not a spinner.
export default function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <div className="skel-block" style={{ height: 14, width: 120 }} />
      <div className="skel-block" style={{ height: 38, width: "55%" }} />
      <div className="skel-block skel-ticket" />
      <div className="skel-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel-li">
            <div className="skel-block" />
            <div>
              <div className="skel-block" />
              <div className="skel-block" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
