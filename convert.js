/*
 * to-markdown - an HTML to Markdown converter
 *
 * Copyright 2011+, Dom Christie
 * Licenced under the MIT licence
 *
 */

'use strict';

// var toMarkdown
let converters;
const fs=require("fs");
const mdConverters = require('./lib/md-converters');
const gfmConverters = require('./lib/gfm-converters');
const HtmlParser = require('./lib/html-parser');
const collapse = require('collapse-whitespace');

/*
 * Utilities
 */

const blocks = ['address', 'article', 'aside', 'audio', 'blockquote', 'body',
  'canvas', 'center', 'dd', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hgroup', 'hr', 'html', 'isindex', 'li', 'main', 'menu', 'nav',
  'noframes', 'noscript', 'ol', 'output', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
];

const voids = [
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'
];

const isBlock = (node) => { return blocks.indexOf(node.nodeName.toLowerCase()) !== -1; };
const isVoid = (node) => { return voids.indexOf(node.nodeName.toLowerCase()) !== -1; };
const htmlToDom = (string) => {
  var tree = new HtmlParser().parseFromString(string, 'text/html');
  collapse(tree.documentElement, isBlock);
  return tree;
};

/*
 * Flattens DOM tree into single array
 */

const bfsOrder = (node) => {
  var inqueue = [node];
  var outqueue = [];
  var elem;
  var children;
  let i;

  while (inqueue.length > 0) {
    elem = inqueue.shift();
    outqueue.push(elem);
    children = elem.childNodes;
    for (i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) inqueue.push(children[i]);
    }
  }
  outqueue.shift();
  return outqueue;
};

/*
 * Contructs a Markdown string of replacement text for a given node
 */

const getContent = (node) => {
  var text = '';
  for (var i = 0; i < node.childNodes.length; i++) {
    if (node.childNodes[i].nodeType === 1) {
      text += node.childNodes[i]._replacement;
    } else if (node.childNodes[i].nodeType === 3) {
      text += node.childNodes[i].data;
    } else continue;
  }
  return text;
};

/*
 * Returns the HTML string of an element with its contents converted
 */

const outer = (node, content) => {
  return node.cloneNode(false).outerHTML.replace('><', '>' + content + '<');
};

const canConvert = (node, filter) => {
  if (typeof filter === 'string') {
    return filter === node.nodeName.toLowerCase();
  }
  if (Array.isArray(filter)) {
    return filter.indexOf(node.nodeName.toLowerCase()) !== -1;
  } else if (typeof filter === 'function') {
    return filter.call(toMarkdown, node);
  } else {
    throw new TypeError('`filter` needs to be a string, array, or function');
  }
};

const isFlankedByWhitespace = (side, node) => {
  var sibling;
  var regExp;
  var isFlanked;

  if (side === 'left') {
    sibling = node.previousSibling;
    regExp = / $/;
  } else {
    sibling = node.nextSibling;
    regExp = /^ /;
  }

  if (sibling) {
    if (sibling.nodeType === 3) {
      isFlanked = regExp.test(sibling.nodeValue);
    } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
      isFlanked = regExp.test(sibling.textContent);
    }
  }
  return isFlanked;
};

const flankingWhitespace = (node, content) => {
  var leading = '';
  var trailing = '';

  if (!isBlock(node)) {
    var hasLeading = /^[ \r\n\t]/.test(content);
    var hasTrailing = /[ \r\n\t]$/.test(content);

    if (hasLeading && !isFlankedByWhitespace('left', node)) {
      leading = ' ';
    }
    if (hasTrailing && !isFlankedByWhitespace('right', node)) {
      trailing = ' ';
    }
  }

  return { leading: leading, trailing: trailing };
};

/*
 * Finds a Markdown converter, gets the replacement, and sets it on
 * `_replacement`
 */

const processNode = (node) => {
  var replacement;
  var content = getContent(node);

  // Remove blank nodes
  if (!isVoid(node) && !/A|TH|TD/.test(node.nodeName) && /^\s*$/i.test(content)) {
    node._replacement = '';
    return;
  }

  for (var i = 0; i < converters.length; i++) {
    var converter = converters[i];

    if (canConvert(node, converter.filter)) {
      if (typeof converter.replacement !== 'function') {
        throw new TypeError('`replacement` needs to be a function that returns a string');
      }

      var whitespace = flankingWhitespace(node, content);

      if (whitespace.leading || whitespace.trailing) {
        content = content.trim();
      }
      replacement = whitespace.leading +
        converter.replacement.call(toMarkdown, content, node) +
        whitespace.trailing;
      break;
    }
  }

  node._replacement = replacement;
};

var toMarkdown = function (input, options) {
  options = options || {};

  if (typeof input !== 'string') {
    throw new TypeError(input + ' is not a string');
  }

  if (input === '') {
    return '';
  }

  // Escape potential ol triggers
  input = input.replace(/(\d+)\. /g, '$1\\. ');

  var clone = htmlToDom(input).body;
  var nodes = bfsOrder(clone);
  var output;

  converters = mdConverters.slice(0);
  if (options.gfm) {
    converters = gfmConverters.concat(converters);
  }

  if (options.converters) {
    converters = options.converters.concat(converters);
  }

  // Process through nodes in reverse (so deepest child elements are first).
  for (var i = nodes.length - 1; i >= 0; i--) {
    processNode(nodes[i]);
  }
  output = getContent(clone);

  return output.replace(/^[\t\r\n]+|[\t\r\n\s]+$/g, '')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n');
};

toMarkdown.isBlock = isBlock;
toMarkdown.isVoid = isVoid;
toMarkdown.outer = outer;

const main = () => {
  if (process.argv[2] !== undefined) {
    let htmlData=fs.readFileSync(process.argv[2], 'utf8');
    let mdData=toMarkdown(htmlData);
    console.log(mdData);
  } else {
    console.log("No input file");
  }
};

main();
