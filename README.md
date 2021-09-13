# JIRA summery WRITER

JIRA WRITER is a NODE.JS library for generating sprint summery and spring planing report.

### Requirements

* Node js:

```bash
  $ curl "https://nodejs.org/dist/latest/node-${VERSION:-$(wget -qO- https://nodejs.org/dist/latest/ | sed -nE 's|.*>node-(.*)\.pkg</a>.*|\1|p')}.pkg" > "$HOME/Downloads/node-latest.pkg" && sudo installer -store -pkg "$HOME/Downloads/node-latest.pkg" -target "/" 
```

Or with brew:

```bash
$ brew install node
```

### Installation

* rename the .env.example file to .env.
* Add required fields in it. install project requirements.

```bash
$ npm i
```

### Usage

In the project folder run:

```bash
$ node index.js
```

## TODO:

* Added write to confluence functionality.