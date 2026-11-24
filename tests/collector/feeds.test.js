/* Kiem thu bo doc datafeed (feeds.js): CSV khoan dung voi dau " chi inch trong ten SP (su co CellphoneS 20-24/11/2026). */
const { parseCSV } = require('../../collector/feeds.js');
const t = (n, c) => { if (!c) { console.error('FAIL', n); process.exitCode = 1; } else console.log('ok', n); };
let r = parseCSV('name,price,url\nMàn hình Dell 27" UltraSharp,5000000,https://a/1\nMacBook Air 13" M2,20000000,https://a/2\n"Tivi 55"" Sony",9000000,https://a/3\n"Loa ""JBL"", đen",100,https://a/4\n');
t('4 dong', r.length === 4); t('inch khong boc', r[0].name === 'Màn hình Dell 27" UltraSharp' && r[0].price === '5000000'); t('inch 2', r[1].name === 'MacBook Air 13" M2');
t('boc ngoac chuan', r[2].name === 'Tivi 55" Sony' && r[2].url === 'https://a/3'); t('dau phay trong ngoac', r[3].name === 'Loa "JBL", đen');
r = parseCSV('a,b\n"x\ny",1\n"Màn hình 27" Dell",2\n'); t('xuong dong trong ngoac', r[0].a === 'x\ny' && r[0].b === '1'); t('inch trong truong boc sai chuan', r.length === 2 && r[1].a === 'Màn hình 27" Dell' && r[1].b === '2');
r = parseCSV('a;b\n1;2\n'); t('dau cham phay', r[0].b === '2');
// 10.000 dong co dau inch khong boc ngoac: phai doc du, khong nuot dong
{ const lines = ['name,price,url']; for (let i = 0; i < 10000; i++) lines.push(`Màn hình ${20 + (i % 15)}" Mẫu ${i},${1000000 + i},https://a/${i}`);
  const r2 = parseCSV(lines.join('\n') + '\n'); t('10.000 dong du', r2.length === 10000 && r2[9999].price === '1009999'); }
if (!process.exitCode) console.log('feeds.test: tat ca dat');
