require('dotenv').config();

const { fetchJson } = require('fetch-json');
const fastcsv = require('fast-csv');
const fs = require('fs');

const url = `https://naturalintelligence.atlassian.net/rest/agile/1.0/sprint/${process.env.SPRINT}/issue?fields=epic,parent,summary,key,status,issuetype,labels,assignee,timetracking`;

const relevantTypes = { bug: 'bug', story: 'story', task: 'story', 'tech-debt': 'tech-debt', p1: 'p1', additional: 'additional', unfinished: 'unfinished' };
const relevantLabels = ['tech-debt', 'p1', 'additional', 'unfinished'];
const stretchLabel = 'stretch';

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
    isStretch: labels.find((label) => label === stretchLabel),
  };
}

function mapIssues(issues) {
  return issues.map((issue) => {
    const { key, fields } = issue;
    const {
      epic, parent, summary, issuetype: issueType, labels, assignee, timetracking,
    } = fields;
    const { originalEstimate, timeSpent } = timetracking;
    const relevantLabel = labels.find((label) => relevantLabels.find((l) => label.toLowerCase()
      .includes(l.toLowerCase())));
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

function main() {
  fetchJson.get(url, {},
    { headers: { Authorization: `Basic ${Buffer.from(process.env.KEY).toString('base64')}` } })
    .then((res) => {
      const { issues } = res;
      const mappedIssues = mapIssues(issues);
      mappedIssues.forEach((issue) => {
        if (issue.type === 'sub-task') {
          const parentIssue = mappedIssues.find((i) => i.key === issue.parentKey);
          if (parentIssue) parentIssue.calculatedTime += issue.calculatedTime;
        }
      });

      const issuesByType = mappedIssues.reduce((acc, issue) => {
        const { type } = issue;
        const relevantType = relevantTypes[type];
        if (!relevantType) return acc;
        const finalIssue = {
          summary: issue.summary,
          key: issue.key,
          name: issue.name,
          estimation: issue.originalEstimate,
          comments: issue.isStretch ? 'stretch' : '',
          estimatedDelivery: issue.isStretch ? 'Next sprint' : 'This sprint',
          time: `${issue.calculatedTime}d`,
          epic: issue.epic,
        };
          // eslint-disable-next-line no-unused-expressions
        acc[relevantType] ? acc[relevantType].push(finalIssue) : acc[relevantType] = [finalIssue];
        return acc;
      }, {});
      writeIssuesToCsv(issuesByType);
    });
}

main();
