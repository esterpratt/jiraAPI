require('dotenv').config();
const fs = require('fs');
const fastcsv = require('fast-csv');
const { fetchJson } = require('fetch-json');

const baseUrl = 'https://naturalintelligence.atlassian.net/rest/agile/1.0/sprint/';

// TODO: get fields from outside
const fields = ['epic', 'parent', 'summary', 'key', 'status', 'issuetype', 'labels', 'assignee', 'timetracking'];

const relevantTypes = {
  bug: 'bug', story: 'story', task: 'story', 'tech-debt': 'tech-debt', p1: 'p1', additional: 'additional',
};
const relevantLabels = ['tech-debt', 'p1', 'additional'];
const STRETCH = 'stretch';
const PLANNING = 'planning';
const SPRINT_REPORT = 'report';
const SUB_TASK = 'sub-task';
const UNFINISHED = 'unfinished';

const sprintUrl = `${baseUrl}${process.env.SPRINT}`;
const issuesUrl = `${baseUrl}${process.env.SPRINT}/issue?maxResults=100&fields=${fields}`;

let reportType = PLANNING;
let totalTime = 0;

function createIssue(relevantLabel, issuetype, parent, epic, key, summary, assignee,
  originalEstimate, timeSpent, labels) {
  return {
    type: relevantLabel ? relevantLabel.toLowerCase() : issuetype.name.toLowerCase(),
    parentKey: parent && parent.key,
    epic: epic && epic.key,
    key,
    summary,
    name: assignee ? assignee.displayName : 'N/A',
    originalEstimate,
    calculatedTime: timeSpent ? +timeSpent.slice(0, timeSpent.length - 1) : 0,
    isStretch: labels.find((label) => label === STRETCH),
  };
}

function mapIssues(issues) {
  return issues.map((issue) => {
    const { key, fields } = issue;
    const {
      epic, parent, summary, issuetype: issueType, labels, assignee, timetracking,
    } = fields;
    const { originalEstimate, timeSpent } = timetracking;
    const relevantLabel = relevantLabels.find((label) => labels.find((l) => l.toLowerCase()
      .includes(label.toLowerCase())));
    return createIssue(relevantLabel, issueType, parent, epic, key, summary, assignee,
      originalEstimate, timeSpent, labels);
  });
}

function writeIssuesToCsv(issuesByType) {
  fs.mkdir('export', { recursive: true }, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    Object.keys(issuesByType).forEach((type) => {
      const arrayToPrint = issuesByType[type]; const
        ws = fs.createWriteStream(`export/${type}.csv`);
      fastcsv.write(arrayToPrint, { headers: true }).on('finish', () => {
        console.info(`Write ${type} to CSV successfully!`);
      }).on('error', (err) => {
        console.error(`ERROR:${err}`);
      }).pipe(ws);
    });
  });
}

function getReportType() {
  return fetchJson.get(sprintUrl, {},
    { headers: { Authorization: `Basic ${Buffer.from(process.env.KEY).toString('base64')}` } })
  .then((res) => {
    const now = new Date();
    if (new Date(res.completeDate) < now) {
      return SPRINT_REPORT;
    }
    return PLANNING;
  })
}

function getFinalIssue(issue) {
  if (reportType === SPRINT_REPORT) {
    const time = issue.calculatedTime;
    return {
      summary: issue.summary,
      key: issue.key,
      name: issue.name,
      time: `${time}d`,
      percentage: `${Math.round(time / totalTime * 100)}%`,
      comments: issue.isStretch ? 'stretch' : '',
      epic: issue.epic,
    }
  }
  return {
    summary: issue.summary,
    key: issue.key,
    name: issue.name,
    estimation: issue.originalEstimate,
    comments: issue.isStretch ? 'stretch' : '',
    estimatedDelivery: issue.isStretch ? 'Next sprint' : 'This sprint',
    epic: issue.epic,
  };
}

function getTotalTime(issues) {
  return issues.reduce((acc, issue) => {
    return acc + issue.calculatedTime;
  }, 0);
}

function main() {
  getReportType().then(res => {
    reportType = res;
    fetchJson.get(issuesUrl, {},
      { headers: { Authorization: `Basic ${Buffer.from(process.env.KEY).toString('base64')}` } })
    .then((res) => {
      const { issues } = res;
      const mappedIssues = mapIssues(issues);

      // add sub-tasks log work to its parent log work
      mappedIssues.forEach((issue) => {
        if (issue.type === SUB_TASK) {
          const parentIssue = mappedIssues.find((i) => i.key === issue.parentKey);
          if (parentIssue) parentIssue.calculatedTime += issue.calculatedTime;
        }
      });

      if (reportType === SPRINT_REPORT) {
        totalTime = getTotalTime(mappedIssues);
      }

      const issuesByType = mappedIssues.reduce((acc, issue) => {
        const { type } = issue;
        const relevantType = relevantTypes[type];
        if (!relevantType) return acc;
        const finalIssue = getFinalIssue(issue);
        acc[relevantType] ? acc[relevantType].push(finalIssue) : acc[relevantType] = [finalIssue];
        return acc;
      }, {});

      writeIssuesToCsv(issuesByType);
    });
  });
}

main();
