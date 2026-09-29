import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(transformSync(read("hooks/useLandingMotion.js"), { loader:"jsx", format:"cjs" }).code, {
  module, exports:module.exports, require:() => ({}),
});
const { revealFooterWord } = module.exports;
function fixture() {
  const classes = new Set(), letters = [], calls = [];
  const run = { getBoundingClientRect:() => ({ left:100 }), append:(...nodes) => letters.push(...nodes) };
  const source = { textContent:"AgroSphere.", firstChild:{}, parentElement:run };
  let offset = 0;
  const word = {
    classList:{ contains:(name) => classes.has(name), add:(name) => classes.add(name), remove:(name) => classes.delete(name) },
    querySelector:() => source,
    ownerDocument:{ createRange:() => ({ setStart:(_node,index) => { offset=index; }, setEnd:() => {}, getBoundingClientRect:() => ({ left:100 + offset * 17.25 }) }),
      createElement:() => ({ style:{}, remove() { this.removed=true; } }),
    },
  };
  const animate = (node, frames, options) => {
    let finish, reject;
    const animation = { finished:new Promise((resolve,rejectPromise) => { finish=resolve; reject=rejectPromise; }), cancel:() => reject(Error("Cancelled")) };
    calls.push({ node, frames, options, finish }); return animation;
  };
  return { word, source, classes, letters, calls, animate };
}

test("wind splits only the wordmark, preserves measured character positions and original text", () => {
  const f=fixture(); revealFooterWord(f.word,f.animate);
  assert.equal(f.letters.map((node) => node.textContent).join(""),"AgroSphere.");
  assert.equal(f.source.textContent,"AgroSphere.");
  assert.deepEqual(f.letters.map((node) => node.style.left),Array.from({length:11},(_,i) => `${i * 17.25}px`));
  assert.ok(f.classes.has("is-wind-playing"));
});

test("small varied wind offsets settle without overshoot, at 60ms intervals in 1000ms total", () => {
  const f=fixture(); revealFooterWord(f.word,f.animate);
  assert.equal(new Set(f.calls.map((call) => call.frames[0].transform)).size,11);
  f.calls.forEach(({frames,options},i) => {
    assert.equal(frames.length,2); assert.equal(frames[0].opacity,0); assert.equal(frames[0].filter,"blur(3px)");
    assert.equal(frames[1].transform,"translate(0, 0) rotate(0deg)"); assert.equal(frames[1].opacity,1);
    assert.equal(frames[1].filter,"blur(0px)"); assert.equal(options.duration,400); assert.equal(options.delay,i * 60);
    assert.equal(options.easing,"cubic-bezier(.22,.68,.25,1)");
  });
  assert.equal(f.calls.at(-1).options.delay + f.calls.at(-1).options.duration,1000);
});

test("finished reveal removes temporary letters and restores untouched original word", async () => {
  const f=fixture(); revealFooterWord(f.word,f.animate); f.calls.forEach((call) => call.finish());
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.letters.every((node) => node.removed)); assert.equal(f.classes.has("is-wind-playing"),false);
  assert.ok(f.classes.has("is-wind-revealed")); assert.equal(f.source.textContent,"AgroSphere.");
  revealFooterWord(f.word,f.animate); assert.equal(f.calls.length,11);
});

test("pause, resize or unmount cleanup settles immediately and cannot replay", async () => {
  const f=fixture(); const settle=revealFooterWord(f.word,f.animate); settle(); settle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.letters.every((node) => node.removed)); assert.equal(f.classes.has("is-wind-playing"),false);
  revealFooterWord(f.word,f.animate); assert.equal(f.calls.length,11);
  assert.doesNotThrow(() => revealFooterWord(null,f.animate)());
});

test("footer reveal uses existing one-shot observer and reduced-motion/paused policy", () => {
  const motion=read("hooks/useLandingMotion.js"), css=read("styles/landing.css");
  assert.match(motion,/element === footerWord\) settleFooterWord = revealFooterWord/);
  assert.match(motion,/observer.unobserve\(element\)/);
  assert.match(motion,/if \(!policy.enabled\) {[\s\S]*footerWord\?\.classList.add\("is-wind-revealed"\)/);
  assert.match(css,/lp-footer-word:not\(\.is-wind-revealed\) .lp-footer-word-source \{ visibility:hidden; \}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)[\s\S]*lp-footer-word-source \{ visibility:visible!important; \}/);
  assert.match(css,/lp-footer-wind-letter \{ display:none; \}/);
  assert.match(css,/\.lp-footer-word \{ font-size:clamp\(65px,14\.5vw,225px\); letter-spacing:-\.08em; line-height:1\.15/);
  assert.match(read("components/landing/ClosingSections.jsx"),/lp-footer-word-source">AgroSphere\.<\/span>/);
});
