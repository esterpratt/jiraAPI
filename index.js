require('dotenv').config();
const fs = require('fs-extra');
const fastcsv = require('fast-csv');
const { fetchJson } = require('fetch-json');
const readline = require('readline');

const baseUrl = 'https://naturalintelligence.atlassian.net/rest/agile/1.0/sprint/';
const possibleFields = ['epic', 'parent', 'summary', 'key', 'status', 'issuetype', 'labels', 'assignee', 'timetracking'];
const relevantTypes = {
  bug: 'bug', story: 'story', task: 'story', 'tech-debt': 'tech-debt', p1: 'p1', additional: 'additional',
};
const relevantLabels = ['tech-debt', 'p1', 'additional'];
const STRETCH = 'stretch';
const PLANNING = 'planning';
const SPRINT_REPORT = 'report';
const SUB_TASK = 'sub-task';
const NOT_FOR_REPORT = 'not-for-report';
const UNFINISHED = 'unfinished';

function createIssue(relevantLabel, issueType, parent, epic, key, summary, assignee, labels) {
  const unFinished = labels.find((label) => label === UNFINISHED);
  return {
    type: relevantLabel ? relevantLabel.toLowerCase() : issueType.name.toLowerCase(),
    parentKey: parent && parent.key,
    epic: epic && `${epic.key} - ${epic.summary}`,
    key,
    summary,
    name: assignee ? assignee.displayName : 'N/A',
    isStretch: labels.find((label) => label === STRETCH),
    isFinished: !unFinished,
  };
}

function mapIssues(issues) {
  return issues.map((issue) => {
    const { key, fields } = issue;
    const { epic, parent, summary, issuetype: issueType, labels, assignee } = fields;
    const relevantLabel = relevantLabels.find((label) => labels.find((l) => l.toLowerCase()
    .includes(label.toLowerCase())));
    return createIssue(relevantLabel, issueType, parent, epic, key, summary, assignee, labels);
  });
}

function getSortedIssuesByEpic(issues) {
  return issues.sort((a, b) => {
    return (a.epic || '').localeCompare(b.epic)
  });
}

function arrangeIssues(issues, reportType) {
  return issues.map(issue => getFinalIssue(issue, reportType));
}

function writeIssuesToCsv(issuesByType, reportType) {
  fs.ensureDir('export', { recursive: true }, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    Object.keys(issuesByType).forEach((type) => {
      const issues = issuesByType[type];
      const arrangedIssues = arrangeIssues(issues, reportType);
      const sortedIssues = getSortedIssuesByEpic(arrangedIssues);
      const ws = fs.createWriteStream(`export/${type}.csv`);
      fastcsv.write(sortedIssues, { headers: true }).on('finish', () => console.info(`Write ${type} to CSV successfully!`))
        .on('error', (error) => console.error(`ERROR: ${error}`))
        .pipe(ws);
    });
  });
}

function writeAdditionalDataToCsv(additionalSprintData) {
  fs.ensureDir('export', { recursive: true }, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    const ws = fs.createWriteStream(`export/additionalData.csv`);
    fastcsv.write(additionalSprintData, {headers: true}).on('finish', () => console.info(`Write additional data to CSV successfully!`))
    .on('error', (error) => console.error(`ERROR: ${error}`))
    .pipe(ws);
  });
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    return rl.question(question, ans => {
        rl.close();
        resolve(ans);
      })
    }
  )
}

async function getReportType() {
  const ans = await askQuestion('What report do you want to get? Sprint report (S) or Planning report (P)? ');
  if (ans === 'S') return SPRINT_REPORT;
  return PLANNING;
}

function getSprintNumber() {
  if (process.env.SPRINT) return Promise.resolve(process.env.SPRINT);
  return askQuestion('Please enter Sprint number: ');
}

function getTimePercentages(time, totalTime) {
  return Math.round((time / totalTime) * 100);
}

function getSprintIssue(issue) {
  return {
    summary: issue.summary,
    key: issue.key,
    epic: issue.epic,
    name: issue.name,
    finished: issue.isFinished ? 'V' : 'X',
    shouldHaveFinished: issue.isFinished && !issue.isStretch ? 'V' : 'X',
  };
}

function getPlanningIssue(issue) {
  return {
    summary: issue.summary,
    key: issue.key,
    epic: issue.epic,
    name: issue.name,
    estimatedDelivery: issue.isStretch ? 'Next Sprint' : 'This Sprint',
  };
}

function getFinalIssue(issue, reportType) {
  if (reportType === SPRINT_REPORT) return getSprintIssue(issue);
  else return getPlanningIssue(issue);
}

function getIssuesByType(issues) {
  return issues.reduce((acc, issue) => {
    const { type } = issue;
    const relevantType = relevantTypes[type];
    if (!relevantType) return acc;
    acc[relevantType] ? acc[relevantType].push(issue) : acc[relevantType] = [issue];
    return acc;
  }, {});
}

function buildUrl(sprintNumber, fields) {
  return `${baseUrl}${sprintNumber}/issue?maxResults=100&fields=${fields}`;
}

function filterIssues(issues) {
  return issues.filter(issue => {
    const { fields: { labels } } = issue;
    const shouldNotReport = labels.find((label) => label === NOT_FOR_REPORT);
    return !shouldNotReport;
  })
}

function getIssuesTime(issues = []) {
  return issues.reduce((acc, issue) => {
    return acc + issue.calculatedTime;
  }, 0);
}

function getAdditionalSprintData(issues) {
  return [{
    totalAdditionalTasks: (issues.additional || []).length,
    totalP1Tasls: (issues.p1 || []).length,
  }];
}

async function main() {
  const reportType = await getReportType();
  const sprintNumber = await getSprintNumber();
  const issuesUrl = buildUrl(sprintNumber, possibleFields);

  const { issues } = await fetchJson.get(
    issuesUrl,
    {},
    { headers: { Authorization: `Basic ${Buffer.from(process.env.KEY).toString('base64')}` } },
  );

  if (!issues) {
    console.log('Sorry! No such Sprint. Please check the number and try again.')
    return;
  }

  const issuesForReport = filterIssues(issues);

  const mappedIssues = mapIssues(issuesForReport);

  const issuesByType = getIssuesByType(mappedIssues);

  let additionalSprintData;
  if (reportType === SPRINT_REPORT) {
    additionalSprintData = getAdditionalSprintData(issuesByType, reportType);
    writeAdditionalDataToCsv(additionalSprintData);
  }

  writeIssuesToCsv(issuesByType, reportType);
}

main();
