"use client";

import { useEffect, useState } from "react";

/** On phones: a slim "Register interest" bar once you've scrolled past the top, hidden again at the form. */
export function StickyRegister() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const form = document.getElementById("contact");
    let formVisible = false;
    const io = form
      ? new IntersectionObserver(([e]) => {
          formVisible = e.isIntersecting;
          update();
        })
      : null;
    if (form && io) io.observe(form);
    function update() {
      setShow(window.scrollY > window.innerHeight * 0.9 && !formVisible);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
      io?.disconnect();
    };
  }, []);
  return (
    <div className={`lp-sticky${show ? " on" : ""}`} aria-hidden={!show}>
      <span>
        <b>Free</b> Lite plan · Pro <b>$60</b>/month
      </span>
      <a href="#contact" className="btn primary" tabIndex={show ? 0 : -1}>
        Register interest
      </a>
    </div>
  );
}
