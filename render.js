// Renders stored messages logs into a viewable HTML
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const async = require('async');
const escape = require('escape-html');
const util = require('util');
const moment = require('moment-timezone');
// const pdf = require('html-pdf');
const log = require("npmlog");
const argv = require('yargs')
    .options({
        'target': {
            alias: 't',
            describe: 'ID of the conversation you would like to render.\n' +
            'Use the same option that you used for index.js.',
            demandOption: true
        }
    })
    .help()
    .argv;

const Autolinker = require('autolinker');
const autolinker = new Autolinker({stripPrefix: false,
    // replaceFn : function( match ) {
    //     // escape URL in <a>
    //     var tag = match.buildTag();
    //     tag.setAttr('href', ''); //escape(tag.getAttr('href')));
    //
    //
    //     return tag;
    // }
});

const logPath = path.join('output', argv.target.toString());
const attachmentPath = path.join(logPath, 'attachments');
const htmlPath = path.join(logPath, 'log.html');
const pdfPath = path.join(logPath, 'log.pdf');
const outputStream = fs.createWriteStream(htmlPath, {defaultEncoding: 'utf8'});

// Copy CSS file so that the resulting directory can be distributed
fs.readFile('assets/styles.css', 'utf8', {}, (error, css) => {
    if (error) log.error(error);
    fs.writeFile(path.join(logPath, 'styles.css'), css);
});

const attachmentFiles = fs.readdirSync(attachmentPath);

const timestampHtml = '<p class="line"><span class="timestamp">[%s]</span>&nbsp;%s</p>\n';
const lineHtml = util.format(timestampHtml, '%s', '<span class="message"><span class="sender">%s</span>: <span class="content %s">%s</span>%s</span>');
const eventHtml = util.format(timestampHtml, '%s', '<span class="message event">%s</span>');
outputStream.write('<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>');

// log.level = 'debug';
glob(path.join(logPath, '*.json'), function (error, rawFiles) {
    async.waterfall([
        (callback) => {
            async.map(rawFiles, (file, callback) => {
                callback(null, parseInt(path.basename(file, '.json')));
            }, callback)
        },
        (files, callback) => {
            // Larger numbered files come first
            files.sort().reverse();
            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                let filePath = path.join(logPath, '' + files[fileIndex] + '.json');
                let messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
                    let message = messages[messageIndex];
                    let mt = moment(message.timestamp);

                    switch (message.type) {
                        case 'message':
                            let moreClasses = '';
                            let attachmentDivs = '';
                            // handle emoji size
                            if (message.tags.some((tag) => { return tag.startsWith('hot_emoji_size') })) {
                                moreClasses += 'emoji ';
                                for (let tagIndex = 0; tagIndex < message.tags.length; tagIndex++) {
                                    let tag = message.tags[tagIndex];
                                    if (tag.startsWith('hot_emoji_size')) {
                                        moreClasses += 'emoji-' + tag.split(':')[1];
                                        break;
                                    }
                                }
                            }

                            for (let attachIndex = 0; attachIndex < message.attachments.length; attachIndex++) {
                                let a = message.attachments[attachIndex];
                                if (a.fileName) {
                                    let fullName = a.fileName;
                                    for (let f in attachmentFiles) {
                                        if (attachmentFiles[f].startsWith(a.fileName)) {
                                            fullName = attachmentFiles[f];
                                            break;
                                        }
                                    }

                                    let aPath = path.join('attachments', fullName);
                                    let content = '';
                                    switch (a.type) {
                                        case 'share':
                                        case 'photo':
                                        case 'sticker':
                                        case 'animated_image':
                                            content = util.format('<img src="%s">', aPath);
                                            break;
                                        default:
                                            content = util.format('<a href="%s" target="_blank">%s</a>', aPath, fullName);
                                            break;
                                    }
                                    attachmentDivs += util.format('<div class="attachment %s">%s</div>', a.type, content);
                                }
                            }

                            let splitM = message.body.split('\n');
                            for (let m in splitM) {
                                outputStream.write(util.format(
                                    lineHtml,
                                    escape(mt.tz(moment.tz.guess()).format('llll z')),
                                    escape(message.senderName),
                                    moreClasses,
                                    autolinker.link(escape(splitM[m])),
                                    attachmentDivs
                                ));
                            }
                            break;
                        case 'event':
                            outputStream.write(util.format(
                                eventHtml,
                                escape(mt.tz(moment.tz.guess()).format('llll z')),
                                escape(message.logMessageBody)
                            ));
                            break;
                    }


                }
            }
            callback();
        }
    ], (err) => {
        outputStream.write('<script>window.onload = function () { window.PHANTOM_HTML_TO_PDF_READY = true; }</script></body></html>');
        outputStream.end();

        log.info('render', util.format('Logs rendered to %s. Open it in your web browser.', htmlPath));
    });
});
