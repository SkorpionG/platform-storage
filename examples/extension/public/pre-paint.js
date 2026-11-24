/*
  Paints the operating system's preference before the first frame. A web page can do better and read the stored theme synchronously; an extension area only answers later, so the stored choice is applied once the first read lands and this is what keeps the frame before it from being the wrong one.

  A file of its own rather than an inline script, because an extension page's content security policy refuses inline scripts, and the browser skips one with nothing but a console error. A classic script rather than a module, so it blocks the first paint instead of running after it.
*/
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}
