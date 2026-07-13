# AWS SAA-C03 模擬考題練習

一個純前端（HTML/CSS/JS，無需建置）的 AWS Certified Solutions Architect – Associate (SAA-C03) 模擬考題練習網站，題庫共 1018 題，來源為 ExamTopics 公開題庫 PDF。

## 頁面結構

- `index.html` — 首頁，顯示整體練習正確率統計，並連結到每日背題與自由練習
- `daily.html` — 每日背題計畫：每天自動指派下 10 題，追蹤完成進度、連續天數與歷史紀錄
- `practice.html` — 自由練習：隨機出題 / 依題號順序 / 只練錯過的題目 / 只練標記的題目 / 只練沒做過的題目，自選題數

## 功能

- 支援單選與多選（Choose two/three）題型
- 答題後即時顯示正確答案與對錯
- 練習紀錄（作答次數、正確率、標記星號、每日背題進度）儲存在瀏覽器 localStorage，不會上傳到任何伺服器
- 練習結束顯示成績與答錯題目列表，可一鍵複習答錯題目

## 本機預覽

不需要安裝任何套件，直接啟一個靜態伺服器即可：

```bash
cd aws-saa-practice
python3 -m http.server 8000
# 瀏覽器開啟 http://localhost:8000
```

## 部署

本專案為純靜態網站，透過 GitHub Pages 直接託管（見 repo Settings → Pages）。

## 免責聲明

題目內容取自 [ExamTopics](https://www.examtopics.com/) 公開題庫，僅供個人學習與練習使用，正確答案為題庫網站標示之答案，不保證 100% 正確，請自行判斷與查證。
