#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node decompose.js <path-to-template-json>');
  process.exit(1);
}

const resolved    = path.resolve(__dirname, jsonPath);
const templateDir = path.dirname(resolved);
const data        = JSON.parse(fs.readFileSync(resolved, 'utf8'));

const { name, plugin_type, edit_page_url, description, form_schema, options } = data;

const meta = { plugin_type, name, edit_page_url, description };
fs.writeFileSync(path.join(templateDir, 'template-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
console.log('  template-meta.json');

fs.writeFileSync(path.join(templateDir, 'form-schema.json'), JSON.stringify(form_schema, null, 2) + '\n', 'utf8');
console.log('  form-schema.json');

const parts = [
  { key: 'html',     suffix: 'html',    ext: 'html' },
  { key: 'css',      suffix: 'css',     ext: 'css'  },
  { key: 'apply_js', suffix: 'applyJS', ext: 'js'   },
  { key: 'undo_js',  suffix: 'resetJS', ext: 'js'   },
];

for (const { key, suffix, ext } of parts) {
  const content  = options[key] || '';
  const filename = `${name}-${suffix}.${ext}`;
  fs.writeFileSync(path.join(templateDir, filename), content, 'utf8');
  console.log(`  ${filename}`);
}

console.log(`\nDone → ${templateDir}`);
console.log('Run "npm run build" (or "node build.js <dir>") to recompile.');
