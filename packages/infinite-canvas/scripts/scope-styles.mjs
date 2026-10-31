import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const scopeClass = "infinite-canvas-root";
const rawPath = new URL("../styles/infinite-canvas.raw.css", import.meta.url);
const outputPath = new URL("../styles/infinite-canvas.css", import.meta.url);
const css = await readFile(rawPath, "utf8");
const root = postcss.parse(css, { from: rawPath.pathname });
const keyframeNames = new Map();

// Tailwind's custom dark/RTL variant prelude is emitted with a standalone `&`.
// Give it an explicit root before selector scoping so it remains valid CSS.
root.walkRules((rule) => {
    if (rule.selector === "&:is(.dark *)") rule.selector = ":root.dark *";
    else if (rule.selector === '&:where([dir="rtl"], [dir="rtl"] *)') rule.selector = ':root[dir="rtl"], :root[dir="rtl"] *';
});

root.walkAtRules((rule) => {
    if (!/keyframes$/i.test(rule.name)) return;
    const originalName = rule.params.trim();
    const scopedName = `infinite-canvas-${originalName}`;
    keyframeNames.set(originalName, scopedName);
    rule.params = scopedName;
});

if (keyframeNames.size) {
    root.walkDecls((declaration) => {
        if (!/animation/i.test(declaration.prop)) return;
        for (const [originalName, scopedName] of keyframeNames) {
            const escapedName = originalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            declaration.value = declaration.value.replace(new RegExp(`(^|[^\\w-])${escapedName}(?=$|[^\\w-])`, "g"), `$1${scopedName}`);
        }
    });
}

// Tailwind's registered custom properties are document-global even when their
// style rules are scoped; rename them to avoid affecting the host's Tailwind 3.
root.walkAtRules("property", (property) => {
    property.params = property.params.replace(/--tw-/g, "--ic-tw-");
});
root.walkDecls((declaration) => {
    declaration.prop = declaration.prop.replace(/--tw-/g, "--ic-tw-");
    declaration.value = declaration.value.replace(/--tw-/g, "--ic-tw-");
});

function isKeyframes(rule) {
    let parent = rule.parent;
    while (parent) {
        if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return true;
        parent = parent.parent;
    }
    return false;
}

root.walkRules((rule) => {
    if (!rule.selector || isKeyframes(rule)) return;
    rule.selector = selectorParser((selectors) => {
        selectors.each((selector) => {
            const first = selector.nodes.find((node) => node.type !== "comment");
            const isRootSelector = first?.type === "pseudo" && [":root", ":host"].includes(first.value)
                || first?.type === "tag" && ["html", "body"].includes(first.value.toLowerCase());
            const isDarkThemeRoot = first?.type === "class" && first.value === "dark";

            if (isRootSelector) {
                first.replaceWith(selectorParser.className({ value: scopeClass }));
                return;
            }

            if (isDarkThemeRoot) {
                first.replaceWith(selectorParser.className({ value: scopeClass }));
                selector.prepend(selectorParser.className({ value: "dark" }));
                return;
            }

            selector.prepend(selectorParser.combinator({ value: " " }));
            selector.prepend(selectorParser.className({ value: scopeClass }));
        });
    }).processSync(rule.selector);
});

// The host app uses Tailwind 3, whose PostCSS plugin rejects Tailwind 4's
// built-in `@layer base` without its own `@tailwind base` directive. Flatten
// the already-built source layers while preserving their emitted order.
root.walkAtRules("layer", (layer) => {
    if (layer.nodes) layer.replaceWith(...layer.nodes);
    else layer.remove();
});

root.append(postcss.parse(`.${scopeClass}{box-sizing:border-box;width:100%;height:100%;min-height:0;font-family:"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif}`));

await writeFile(outputPath, root.toString(), "utf8");
console.log(`Scoped Infinite Canvas styles: ${outputPath.pathname}`);

