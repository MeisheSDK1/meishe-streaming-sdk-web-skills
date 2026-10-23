#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--source') args.source = path.resolve(argv[++index]);
    else if (value === '--project') args.project = path.resolve(argv[++index]);
    else if (value === '--user-confirmed-copy') args.userConfirmed = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.source) throw new Error('Provide --source <customer-sdk-directory>.');
  if (!args.project) throw new Error('Provide --project <target-project>.');
  if (!args.userConfirmed) throw new Error('Refusing to copy runtime files without --user-confirmed-copy after explicit conversational approval.');
  for (const [name, directory] of Object.entries({ source: args.source, project: args.project })) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      throw new Error(`${name} directory does not exist: ${directory}`);
    }
  }
  return args;
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Runtime delivery must not contain symlinks: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(path.relative(root, fullPath).replace(/\\/g, '/'));
    }
  };
  visit(root);
  return files.sort();
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function inspectRuntimeDirectory(root) {
  const files = listFiles(root);
  const sdkApi = files.find((file) => file.toLowerCase() === 'nvstreamingsdk.js');
  const wasmFiles = files.filter((file) => !file.includes('/') && path.extname(file).toLowerCase() === '.wasm');
  const pairedWasm = wasmFiles.filter((file) => {
    const jsRelative = file.slice(0, -'.wasm'.length) + '.js';
    return files.some((candidate) => candidate.toLowerCase() === jsRelative.toLowerCase());
  });
  const errors = [];
  if (!sdkApi) errors.push('NvStreamingSdk.js is missing from the delivery root.');
  if (wasmFiles.length === 0) errors.push('No WASM runtime file was found in the delivery root.');
  if (wasmFiles.length > 0 && pairedWasm.length === 0) {
    errors.push('No WASM file has its matching JavaScript runtime file.');
  }
  return { files, sdkApi: sdkApi || null, wasmFiles, pairedWasm, errors };
}

export function compareDirectories(source, destination) {
  const sourceFiles = listFiles(source);
  const destinationFiles = listFiles(destination);
  const allFiles = [...new Set([...sourceFiles, ...destinationFiles])].sort();
  const differences = allFiles.filter((relative) => {
    const sourceFile = path.join(source, relative);
    const destinationFile = path.join(destination, relative);
    if (!fs.existsSync(sourceFile) || !fs.existsSync(destinationFile)) return true;
    return hash(sourceFile) !== hash(destinationFile);
  });
  return { identical: differences.length === 0, differences };
}

function assertContainedDirectory(projectReal, directory, label) {
  const info = fs.lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory inside the target project: ${directory}`);
  }
  const real = fs.realpathSync(directory);
  const relative = path.relative(projectReal, real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the target project: ${directory}`);
  }
  return real;
}

export function installRuntime({ source, project, userConfirmed = false }, copyDirectory = fs.cpSync) {
  if (!userConfirmed) {
    throw new Error('Refusing to copy runtime files without explicit conversational approval attested by userConfirmed.');
  }
  const sourceReal = fs.realpathSync(source);
  const projectReal = fs.realpathSync(project);
  const sourceInspection = inspectRuntimeDirectory(sourceReal);
  if (sourceInspection.errors.length > 0) {
    throw new Error(`Invalid customer runtime delivery: ${sourceInspection.errors.join(' ')}`);
  }
  const publicDirectory = path.join(projectReal, 'public');
  if (!fs.existsSync(publicDirectory)) fs.mkdirSync(publicDirectory);
  const publicReal = assertContainedDirectory(projectReal, publicDirectory, 'Runtime public directory');
  const destination = path.join(publicReal, 'wasm');
  if (destination === sourceReal || destination.startsWith(`${sourceReal}${path.sep}`)) {
    throw new Error('Runtime source must not contain the target public/wasm directory.');
  }

  if (fs.existsSync(destination)) {
    const destinationReal = assertContainedDirectory(projectReal, destination, 'Runtime destination');
    const comparison = compareDirectories(sourceReal, destinationReal);
    if (comparison.identical) {
      return { status: 'unchanged', destination, fileCount: sourceInspection.files.length };
    }
    if (listFiles(destinationReal).length > 0) {
      const preview = comparison.differences.slice(0, 5).join(', ');
      throw new Error(`Refusing to overwrite conflicting public/wasm files: ${preview}`);
    }
  }

  const staging = path.join(publicReal, `.wasm-install-${process.pid}-${crypto.randomUUID()}`);
  let removedEmptyDestination = false;
  try {
    copyDirectory(sourceReal, staging, { recursive: true, errorOnExist: true, force: false });
    if (fs.existsSync(destination)) {
      fs.rmdirSync(destination);
      removedEmptyDestination = true;
    }
    fs.renameSync(staging, destination);
  } catch (error) {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    if (removedEmptyDestination && !fs.existsSync(destination)) fs.mkdirSync(destination);
    throw error;
  }
  return { status: 'installed', destination, fileCount: sourceInspection.files.length };
}

function main() {
  console.log(JSON.stringify(installRuntime(parseArgs(process.argv.slice(2))), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
