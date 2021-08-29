const fetch = require("node-fetch");
const fastcsv = require("fast-csv");
require('dotenv').config();
const fs = require("fs");
const key = process.env.KEY;
const sprintNumber = process.env.SPRINT;

const url = `https://naturalintelligence.atlassian.net/rest/agile/1.0/sprint/${sprintNumber}/issue?fields=parent,summary,key,status,issuetype,labels,assignee,timetracking`;

const relevantTypes = { bug: 'bug', story: 'story', task: 'story', 'tech-debt': 'tech-debt', p1: 'p1', additional: 'additional' };
const relevantLabels = ['tech-debt', 'p1', 'additional'];

function callJira() {
  fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(key).toString('base64')}`,
      'Accept': 'application/json'
    }
  })
  .then(res => res.text())
  .then(res => {
    const { issues } = JSON.parse(res);
    const mappedIssues = issues.map(issue => {
      const { key, fields } = issue;
      const { parent, summary, status, issuetype, labels, assignee, timetracking } = fields;
      const { originalEstimate, timeSpent } = timetracking;
      let calculatedTime = 0;
      if (timeSpent) {
        calculatedTime = +timeSpent.slice(0, timeSpent.length - 1);
      }

      const isDone = status.name === 'done';
      const name = assignee ? assignee.displayName : 'N/A';
      let type = issuetype.name.toLowerCase();

      const relevantLabel = labels.find(label => relevantLabels.find(l => label.includes(l)));
      if (relevantLabel) type = relevantLabel;

      return { type, parentKey: parent && parent.key, key, summary, name, originalEstimate, calculatedTime, isDone };
    });

    mappedIssues.forEach(issue => {
      const { type } = issue;
      if (type === 'sub-task') {
        const parentIssue = mappedIssues.find(i => i.key === issue.parentKey);
        if (parentIssue) {
          parentIssue.calculatedTime += issue.calculatedTime;
        }
      }
    });

    const issuesByType = mappedIssues.reduce((acc, issue) => {
      const { type } = issue;
      let relevantType = relevantTypes[type];
      if (!relevantType) return acc;

      const finalIssue = {
        summary: issue.summary,
        key: issue.key,
        name: issue.name,
        estimation: issue.originalEstimate + 'd',
        time: issue.calculatedTime + 'd',
      }

      if (!acc[relevantType]) {
        acc[relevantType] = [finalIssue]
      } else {
        acc[relevantType].push(finalIssue);
      }
      return acc;
    }, {})

    Object.keys(issuesByType).forEach(type => {
      const arrayToPrint = issuesByType[type];
      const ws = fs.createWriteStream(`${type}.csv`);
      fastcsv
      .write(arrayToPrint, { headers: true })
      .on("finish", function() {
        console.log("Write to CSV successfully!");
      })
      .pipe(ws);
    })
  });
}

callJira()