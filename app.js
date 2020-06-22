const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EOL } = require('os');
const Parser = require('rss-parser');
const parser = new Parser();

process.chdir(__dirname);

const CPI_RSS_URL = 'http://periodismoinvestigativo.com/feed/';
const log_dir = './log';
const tmp_dir = './tmp';
const cpi_json_file = 'latest_cpi_news_feed.json';
const cpi_log_file = 'latest_cpi_article.log';

if (!fs.existsSync(log_dir)) {
    fs.mkdirSync(log_dir);
}

if (!fs.existsSync(tmp_dir)) {
    fs.mkdirSync(tmp_dir);
}

let cpi_json_path = path.join(tmp_dir, cpi_json_file);
let cpi_log_path = path.join(log_dir, cpi_log_file);

let news_feed = {
    cpi: []
};

async function get_cpi_news_feed (rss_feed, callback) {
    await parser.parseURL(rss_feed, function(err, feed) {
        if (err) {
            console.log(err)
        }
        else {
            // Output information to console.log
            console.log('Recopilando artículos de la página del ' + feed.title);

            // Create JSON
            feed.items.forEach(item => {
                pubDateInEpochTime = Date.parse(item.pubDate);
    
                news_feed.cpi.push({pubDate: item.pubDate,
                                    pubDateEpoch: pubDateInEpochTime,
                                    id: item.guid.split('=')[1],
                                    title: item.title,
                                    link: item.link});
                });
            let cpi_json_news_feed = JSON.stringify(news_feed, null, '\t');
            callback(cpi_json_news_feed);
        }
    })
}

function publish_article_to_telegram (json_feed) {
    let latest_headline = json_feed.cpi[0];
    let latest_headline_id = latest_headline.id;

    let message = `\"\'${latest_headline.title}\
        ${latest_headline.link}\
        Fecha de Publicación: ${latest_headline.pubDate}\'\"\"`;
    let channel_name = "@periodismo_investigativo";
    let publish_to_telegram = spawn("/snap/bin/telegram-cli", ["-We", "\"msg", channel_name, message], { shell: true });

    publish_to_telegram.stdout.on('data', data => {
        console.log(`stdout: ${data}`);
    });
    publish_to_telegram.stderr.on('data', data => {
        console.log(`stderr: ${data}`);
    });
    publish_to_telegram.on('error', (error) => {
        console.log(`error: ${error.message}`);
    });
    publish_to_telegram.on('close', exit_code => {
        console.log(`Publishing to telegram exited with status code: ${exit_code}`);
    });

    // Log the id of the latest headline
    fs.writeFile(cpi_log_path, latest_headline_id, (err) => {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Latest headline ID logged successfully.');
            console.log(`Latest headline ID: ${latest_headline_id}`);
        }
    });
}

get_cpi_news_feed(CPI_RSS_URL, (json_news_feed) => {
    let parsed_json_news_feed = JSON.parse(json_news_feed);
    let latest_headline = parsed_json_news_feed.cpi[0];
    let latest_headline_id = latest_headline.id;

    // Create JSON news feed file
    fs.writeFile(cpi_json_path, json_news_feed, (err) => {
        if (err) {
            console.log(err);
        }
        console.log('CPI RSS feed saved successfully as JSON file.');

        // Check if log file exists
        if (fs.existsSync(cpi_log_path)) {
            let last_published_headline_id = fs.readFileSync(cpi_log_path, 'utf8');
            
            // Check if the latest headline in CPI site is not the last headline published to Telegram
            if (last_published_headline_id != latest_headline_id) {
                console.log('There is a new article from CPI.');
                console.log('Publishing now...');
                publish_article_to_telegram(parsed_json_news_feed);
            }
            else {
                console.log('There are no new articles to publish yet.');
                null
            }
        }
        else {
            // Create empty log file
            console.log('Creating log file...');
            fs.closeSync(fs.openSync(cpi_log_path, 'w'));
            console.log('Log file created.');
            console.log('Publishing now...');
            publish_article_to_telegram(parsed_json_news_feed);
        }
    });

});

// Telegram-cli command:
// telegram-cli -We "msg <user> `'${item.title}\n${item.link}\n\n${item.pubDate}'`"