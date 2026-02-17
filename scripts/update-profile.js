#!/usr/bin/env node

/**
 * GitHub 프로필 README 자동 업데이트
 * list.json에서 최신 기사를 가져와 카테고리별로 README 업데이트
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const API_URL = 'https://www.society-now.com/sonow/article/list.json';
const README_PATH = path.join(__dirname, '..', 'README.md');

const CATEGORY_GROUPS = {
    'HEADLINES': { codes: ['hl', 'pb', 'wr', 'lr', 'pi', 'td', 'nw'], marker: 'HEADLINES', max: 5 },
    'AI_TECH': { codes: ['ai', 'ta', 'an', 'dt', 'sn', 'ax', 'it'], marker: 'AI_TECH', max: 5 },
    'ECONOMY': { codes: ['kn', 'st', 'co', 're', 'di', 'in'], marker: 'ECONOMY', max: 4 },
    'EDUCATION': { codes: ['ed', 'eg', 'ap', 'th', 'mh', 'ex'], marker: 'EDUCATION', max: 3 },
    'KCULTURE': { codes: ['kc', 'hk', 'kt', 'kp', 'kb', 'kh'], marker: 'KCULTURE', max: 3 }
};

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'sonow-profile-updater' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function formatDate(articleId) {
    const d = articleId.slice(2, 8);
    if (d.length !== 6) return '';
    return `${d.slice(2, 4)}.${d.slice(4, 6)}`;
}

function buildTable(articles) {
    if (articles.length === 0) return '';
    let html = '<table>\n';
    for (const a of articles) {
        const title = (a.title || '').replace(/"/g, '&quot;').slice(0, 70);
        const date = formatDate(a.article_id);
        const url = a.url || '';
        html += `<tr><td width="16">&#9654;</td><td><a href="${url}"><b>${title}</b></a><br><sub>${date}</sub></td></tr>\n`;
    }
    html += '</table>';
    return html;
}

function updateSection(content, marker, newContent) {
    const startTag = `<!-- AUTO-UPDATE:${marker} -->`;
    const endTag = `<!-- /AUTO-UPDATE:${marker} -->`;
    const startIdx = content.indexOf(startTag);
    const endIdx = content.indexOf(endTag);
    if (startIdx === -1 || endIdx === -1) return content;

    // 마커 바로 위의 수동 테이블도 교체
    // 마커 위에 있는 <table>...</table> 블록 찾기
    const beforeMarker = content.slice(0, startIdx);
    const lastTableStart = beforeMarker.lastIndexOf('<table>');
    const replaceFrom = lastTableStart !== -1 ? lastTableStart : startIdx;

    return content.slice(0, replaceFrom) +
        newContent + '\n' +
        startTag + '\n' + endTag +
        content.slice(endIdx + endTag.length);
}

async function main() {
    console.log('프로필 README 업데이트 시작...\n');

    const articles = await fetchJSON(API_URL);
    const list = Array.isArray(articles) ? articles : (articles.articles || []);
    console.log(`${list.length}개 기사 로드\n`);

    // 카테고리별 분류
    const grouped = {};
    for (const a of list) {
        const code = a.article_id.slice(0, 2);
        if (!grouped[code]) grouped[code] = [];
        grouped[code].push(a);
    }

    let readme = fs.readFileSync(README_PATH, 'utf-8');

    for (const [name, config] of Object.entries(CATEGORY_GROUPS)) {
        const arts = [];
        for (const code of config.codes) {
            if (grouped[code]) arts.push(...grouped[code]);
        }
        // 날짜순 정렬 (최신순)
        arts.sort((a, b) => {
            const da = a.published_date || a.published_time || '';
            const db = b.published_date || b.published_time || '';
            return db.localeCompare(da);
        });

        const top = arts.slice(0, config.max);
        const table = buildTable(top);
        readme = updateSection(readme, config.marker, table);
        console.log(`${name}: ${top.length}개 기사 업데이트`);
    }

    // 기사 수 배지 업데이트
    readme = readme.replace(
        /기사_[\d,]+\+/,
        `기사_${list.length.toLocaleString()}+`
    );

    fs.writeFileSync(README_PATH, readme, 'utf-8');
    console.log('\nREADME 업데이트 완료!');
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
