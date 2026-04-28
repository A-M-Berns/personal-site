import { visit, SKIP } from 'unist-util-visit';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';

const MARGINNOTE_SYMBOL = '{-}';

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'n'
  );
}

function renderMdastToHtml(nodes) {
  const root = { type: 'root', children: nodes };
  const hast = toHast(root, { allowDangerousHtml: true });
  return toHtml(hast, { allowDangerousHtml: true });
}

function getNoteChildren(def) {
  return def.children.length === 1 && def.children[0].type === 'paragraph'
    ? def.children[0].children
    : def.children;
}

function stripWrappingParagraphs(html) {
  return html
    .replace(/^\s*<p>/, '')
    .replace(/<\/p>\s*$/, '')
    .replace(/<\/p>\s*<p>/g, '<br><br>')
    .replace(/<\/p>/g, '<br><br>')
    .replace(/<p>/g, '')
    .replace(/(<br><br>\s*)+$/g, '');
}

function inlineSidenoteBlocks(html) {
  return html
    .replace(/<blockquote>\s*<p>([\s\S]*?)<\/p>\s*<\/blockquote>/g, '<span class="sidenote-quote">$1</span>')
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, '<span class="sidenote-quote">$1</span>');
}

function makeReplacement(id, html, isMargin) {
  const cls = isMargin ? 'marginnote' : 'sidenote';
  const labelCls = isMargin ? 'margin-toggle' : 'margin-toggle sidenote-number';
  const labelSymbol = isMargin ? '&#8853;' : '';
  return [
    { type: 'html', value: `<label for="${id}" class="${labelCls}">${labelSymbol}</label>` },
    { type: 'html', value: `<input type="checkbox" id="${id}" class="margin-toggle" />` },
    { type: 'html', value: `<span class="${cls}">${html}</span>` },
  ];
}

export default function remarkSidenotes() {
  return (tree) => {
    const defs = new Map();
    visit(tree, 'footnoteDefinition', (node) => {
      defs.set(node.identifier, node);
    });

    const usedIds = new Map();

    visit(tree, 'footnoteReference', (node, index, parent) => {
      if (!parent || index == null) return;
      const def = defs.get(node.identifier);
      if (!def) return;

      let html = stripWrappingParagraphs(inlineSidenoteBlocks(renderMdastToHtml(getNoteChildren(def))));

      const trimmed = html.trimStart();
      const isMargin = trimmed.startsWith(MARGINNOTE_SYMBOL);
      if (isMargin) html = trimmed.slice(MARGINNOTE_SYMBOL.length).trimStart();

      const baseId = `sn-${slugify(node.identifier)}`;
      const count = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, count + 1);
      const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
      const replacement = makeReplacement(id, html, isMargin);
      parent.children.splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });

    tree.children = tree.children.filter((node) => node.type !== 'footnoteDefinition');
  };
}
