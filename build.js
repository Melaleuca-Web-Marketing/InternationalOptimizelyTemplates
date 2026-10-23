#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// Resolve template directory from CLI arg, or auto-detect if only one exists
function resolveTemplateDir() {
  const arg = process.argv[2];
  if (arg) return path.resolve(__dirname, arg);

  const entries = fs.readdirSync(__dirname, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
  if (dirs.length === 1) return path.join(__dirname, dirs[0].name);

  console.error('Multiple template directories found. Specify one:\n  node build.js <template-dir>');
  process.exit(1);
}

const templateDir = resolveTemplateDir();

const metaPath   = path.join(templateDir, 'template-meta.json');
const schemaPath = path.join(templateDir, 'form-schema.json');

if (!fs.existsSync(metaPath)) {
  console.error(`Missing template-meta.json in: ${templateDir}`);
  process.exit(1);
}
if (!fs.existsSync(schemaPath)) {
  console.error(`Missing form-schema.json in: ${templateDir}`);
  process.exit(1);
}

const meta       = JSON.parse(fs.readFileSync(metaPath,   'utf8'));
const formSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const { name }   = meta;

function readFile(filename) {
  const filePath = path.join(templateDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing source file: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const output = {
  plugin_type:  meta.plugin_type,
  name:         meta.name,
  edit_page_url: meta.edit_page_url,
  form_schema:  formSchema,
  description:  meta.description,
  options: {
    html:     readFile(`${name}-html.html`),
    css:      readFile(`${name}-css.css`),
    apply_js: readFile(`${name}-applyJS.js`),
    undo_js:  readFile(`${name}-resetJS.js`),
  }
};

const outputPath = path.join(templateDir, `${name}-optimizely-import.json`);
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`Built: ${outputPath}`);
console.log('This is the file to import into Optimizely.');
