// This serverless function creates a new html file corresponding to a submission
// in the Code in the Dark submissions repo (configured in the environment variables)

import { Handler } from '@netlify/functions';
import axios, { AxiosError } from 'axios';

// GITHUB_TOKEN is the personal access token with write access to the submissions repo
// GITHUB_REPO is the name of the submissions repo
// GITHUB_REPO_OWNER is the owner of the submissions repo
// SUBMISSIONS_PATH is the path where the submissions page will be available at,
// should match the redirect (to the submissions repo deployment) in netlify.toml
const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_REPO_OWNER, SUBMISSIONS_PATH = "/submissions" } = process.env;

type BodyParams = {
  discord: string;
  name: string;
  html: string;
};

type FileContentPutBody = {
  message: string;
  content: string;
  sha?: string;
};

const handler: Handler = async (event) => {
  const { discord, name, html }: BodyParams = JSON.parse(event.body || '{}');
  console.log(`Received submission request for name: "${name}", discord: "${discord}"`);

  if (!GITHUB_TOKEN || !GITHUB_REPO || !GITHUB_REPO_OWNER) {
    console.error('Missing environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Missing environment variables',
      }),
    };
  }

  if (!discord || !name || !html) {
    console.error('Missing required parameters');
    return {
      statusCode: 200,
      body: JSON.stringify({
        successs: false,
        message: 'Missing required params, make sure you specify "discord", "name" and "html"',
      }),
    };
  }

  const filename = `${discord.replace('#', '')}.html`;
  const fileContents = `<!--Name: ${name}-->${html}`;

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${filename}`;
  const headers = { Authorization: `token ${GITHUB_TOKEN}` };
  const body: FileContentPutBody = {
    message: `Add/Update ${filename}`,
    content: Buffer.from(fileContents).toString('base64'),
  };

  // Check if the file already exists, and if so, add necessary parameter to update it
  const fileResponse = await axios.get(url, { headers }).catch(() => null);
  if (fileResponse) {
    console.log(`File ${filename} already exists, updating it`);
    body.sha = fileResponse.data.sha;
  }

  try {
    // Create file
    await axios.put(url, body, { headers });
    console.log(`File ${filename} created/updated`);

    // Update the index file to link to the new page
    const linkToPage = `<p><a href="${SUBMISSIONS_PATH}/${filename}">${filename}</a></p>\n`;
    const indexUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/index.html`;
    const indexFileResponse = await axios.get(indexUrl, { headers }).catch(() => null);

    const updateIndexFile = async (newContent: string, existingSha?: string) => {
        const indexUpdateBody: FileContentPutBody = {
            message: 'Update index file',
            content: Buffer.from(newContent).toString('base64'),
            sha: existingSha,
        }
        await axios.put(indexUrl, indexUpdateBody, { headers });
        console.log(`Created/Updated index with link to ${filename}`);
    }

    // If the file doesn't exist, we create a new one with, otherwise add the link to the file's contents if it doesn't already exist
    if (indexFileResponse) {
      const indexFileContent = Buffer.from(indexFileResponse.data.content, 'base64').toString();
      if (!indexFileContent.includes(linkToPage)) {
          await updateIndexFile(indexFileContent + linkToPage, indexFileResponse.data.sha);
      } else {
          console.log(`Index file already has link to ${filename}`);
      }
    } else {
        await updateIndexFile(linkToPage);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully created/updated ${filename}`,
      }),
    };
  } catch (error) {
    console.error(error);
    const e: AxiosError = error as AxiosError;
    if (e.response) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: `Error creating/updating ${filename} or index, original error: ${e.response.data.message}`,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        message: 'Could not connect to GitHub',
      }),
    };
  }
};

export { handler }; // eslint-disable-line import/prefer-default-export