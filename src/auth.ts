import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as parser from 'fast-xml-parser'

export const M2_DIR = '.m2';
export const SETTINGS_FILE = 'settings.xml';

export const DEFAULT_ID = 'github';
export const DEFAULT_USERNAME = 'GITHUB_ACTOR';
export const DEFAULT_PASSWORD = 'GITHUB_TOKEN';

export const DEFAULT_REPOSITORY_ID_PREFIX = 'github';

function extractIds(
  resolvedIds: string[], 
  repositories: any
) {
  if (repositories) {
    return resolvedIds.concat([].concat(repositories).map((value: any) => value.id).filter(value => value.startsWith(DEFAULT_REPOSITORY_ID_PREFIX)));
  }
  return resolvedIds;
}

function resolveServerIds(
  ids: string[], 
  pomFile: string
) {
  let resolvedIds: string[] = [];
  resolvedIds = resolvedIds.concat(ids)
  let content = read(pomFile);
  if (content == undefined) {
    return resolvedIds;
  }
  const pom = parser.parse(content);
  resolvedIds = extractIds(resolvedIds, pom.project.distributionManagement?.repository);
  resolvedIds = extractIds(resolvedIds, pom?.project?.repositories?.repository);
  resolvedIds = extractIds(resolvedIds, pom.project.pluginRepositories?.pluginRepository);
  return [...new Set(resolvedIds)];
}

export async function configAuthentication(
  ids: string[] = [DEFAULT_ID],
  username = DEFAULT_USERNAME,
  password = DEFAULT_PASSWORD,
  generateAllServerIds: boolean = false,
  pomFile = 'pom.xml'
) {
  const resolvedIds: string[] = generateAllServerIds ? resolveServerIds(ids, pomFile) : ids
  console.log(
    `creating ${SETTINGS_FILE} with server-ids: ${resolvedIds};`,
    `environment variables: username=\$${username} and password=\$${password}`
  );
  // when an alternate m2 location is specified use only that location (no .m2 directory)
  // otherwise use the home/.m2/ path
  const directory: string = path.join(
    core.getInput('settings-path') || os.homedir(),
    core.getInput('settings-path') ? '' : M2_DIR
  );
  await io.mkdirP(directory);
  core.debug(`created directory ${directory}`);
  await write(directory, generate(resolvedIds, username, password));
}

function escapeXML(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// only exported for testing purposes
export function generate(
  ids = [DEFAULT_ID],
  username = DEFAULT_USERNAME,
  password = DEFAULT_PASSWORD
) {
  let content = generatePrefix();
  content += generateServers(ids, username, password);
  content += generateSuffix()
  return content
}

function generatePrefix(
) {
  return `
  <settings>
      <servers>`;
}

function generateServers(
  ids: string[], 
  username: string, 
  password: string
) {
  let content = '';
  for (let id of ids) {
    content += generateServer(id, username, password);
  }
  return content;
}

function generateServer(
  id: string, 
  username: string, 
  password: string
) {
  return `
        <server>
          <id>${escapeXML(id)}</id>
          <username>\${env.${escapeXML(username)}}</username>
          <password>\${env.${escapeXML(password)}}</password>
        </server>`;
}

function generateSuffix(
) {
  return `
      </servers>
  </settings>
  `;
}

async function write(directory: string, settings: string) {
  const location = path.join(directory, SETTINGS_FILE);
  if (fs.existsSync(location)) {
    console.warn(`overwriting existing file ${location}`);
  } else {
    console.log(`writing ${location}`);
  }

  return fs.writeFileSync(location, settings, {
    encoding: 'utf-8',
    flag: 'w'
  });
}

function read(location: string): string | undefined {
  if (!fs.existsSync(location)) {
    console.error(`file '${location}' does not exist!`);
    return undefined
  } 

  return fs.readFileSync(location, {
    encoding: 'utf-8',
    flag: 'r'
  });
}
