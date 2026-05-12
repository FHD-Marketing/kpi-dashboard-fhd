import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

let config = null;

function loadConfig() {
  if (config) return config;
  const p = path.resolve(process.cwd(), 'endpoints.yaml');
  config = yaml.load(fs.readFileSync(p, 'utf8'));
  return config;
}

export function getApiUrl() {
  const { api } = loadConfig();
  return `${api.base_url}${api.prefix}`;
}

