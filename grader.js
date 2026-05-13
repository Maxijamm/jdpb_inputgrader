// ==UserScript==
// @name         jpdb.io Eingabe prüfen mit Empfehlungen
// @namespace    local.jpdb.input-check
// @version      1.3
// @match        https://jpdb.io/review*
// @match        https://jpdb.io/*/review*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const KEY_READING = "jpdb_check_reading";
    const KEY_MEANING = "jpdb_check_meaning";
    const KEY_PENDING = "jpdb_check_pending";
    const KANA_ONLY_MARKER = "__KANA_ONLY__";

    function romajiToHiragana(input) {
        let text = (input || "").toLowerCase().trim();

        const map = {
            kya:"きゃ", kyu:"きゅ", kyo:"きょ",
            sha:"しゃ", shu:"しゅ", sho:"しょ",
            cha:"ちゃ", chu:"ちゅ", cho:"ちょ",
            nya:"にゃ", nyu:"にゅ", nyo:"にょ",
            hya:"ひゃ", hyu:"ひゅ", hyo:"ひょ",
            mya:"みゃ", myu:"みゅ", myo:"みょ",
            rya:"りゃ", ryu:"りゅ", ryo:"りょ",
            gya:"ぎゃ", gyu:"ぎゅ", gyo:"ぎょ",
            ja:"じゃ", ju:"じゅ", jo:"じょ",
            bya:"びゃ", byu:"びゅ", byo:"びょ",
            pya:"ぴゃ", pyu:"ぴゅ", pyo:"ぴょ",

            a:"あ", i:"い", u:"う", e:"え", o:"お",
            ka:"か", ki:"き", ku:"く", ke:"け", ko:"こ",
            sa:"さ", shi:"し", si:"し", su:"す", se:"せ", so:"そ",
            ta:"た", chi:"ち", ti:"ち", tsu:"つ", tu:"つ", te:"て", to:"と",
            na:"な", ni:"に", nu:"ぬ", ne:"ね", no:"の",
            ha:"は", hi:"ひ", fu:"ふ", hu:"ふ", he:"へ", ho:"ほ",
            ma:"ま", mi:"み", mu:"む", me:"め", mo:"も",
            ya:"や", yu:"ゆ", yo:"よ",
            ra:"ら", ri:"り", ru:"る", re:"れ", ro:"ろ",
            wa:"わ", wo:"を",
            ga:"が", gi:"ぎ", gu:"ぐ", ge:"げ", go:"ご",
            za:"ざ", ji:"じ", zi:"じ", zu:"ず", ze:"ぜ", zo:"ぞ",
            da:"だ", de:"で", do:"ど",
            ba:"ば", bi:"び", bu:"ぶ", be:"べ", bo:"ぼ",
            pa:"ぱ", pi:"ぴ", pu:"ぷ", pe:"ぺ", po:"ぽ"
        };

        let result = "";

        while (text.length > 0) {
            if (/^([bcdfghjklmpqrstvwxyz])\1/.test(text) && !text.startsWith("nn")) {
                result += "っ";
                text = text.slice(1);
                continue;
            }

            if (text.startsWith("nn")) {
                result += "ん";
                text = text.slice(2);
                continue;
            }

            if (text[0] === "n" && !/[aeiouy]/.test(text[1] || "")) {
                result += "ん";
                text = text.slice(1);
                continue;
            }

            let matched = false;

            for (const len of [3, 2, 1]) {
                const part = text.slice(0, len);

                if (map[part]) {
                    result += map[part];
                    text = text.slice(len);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                result += text[0];
                text = text.slice(1);
            }
        }

        return result;
    }

    function kataToHira(text) {
        return (text || "").replace(/[\u30a1-\u30f6]/g, ch =>
            String.fromCharCode(ch.charCodeAt(0) - 0x60)
        );
    }

    function normalizeReading(text) {
        text = text || "";

        if (/[a-zA-Z]/.test(text)) {
            text = romajiToHiragana(text);
        }

        text = text.replace(/[\u3400-\u9fff]/g, "");

        return kataToHira(text)
            .trim()
            .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
            .replace(/[。、,.!?！？;；:：]/g, "");
    }

    function normalizeMeaning(text) {
        return (text || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ")
            .replace(/[。、,.!?！？;；:：]/g, "");
    }

    function escapeHtml(text) {
        return (text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function highlightReading(user, expected) {
        user = normalizeReading(user);
        expected = normalizeReading(expected);

        let html = "";

        for (let i = 0; i < expected.length; i++) {
            const char = escapeHtml(expected[i]);

            if (user[i] === expected[i]) {
                html += `<span class="jpdb-ok">${char}</span>`;
            } else {
                html += `<span class="jpdb-missing">${char}</span>`;
            }
        }

        if (user.length > expected.length) {
            html += `<span class="jpdb-extra">${escapeHtml(user.slice(expected.length))}</span>`;
        }

        return html || "nicht gefunden";
    }

    function highlightMeaning(user, expected) {
        user = normalizeMeaning(user);
        expected = normalizeMeaning(expected).replace(/^\d+\s+/, "");

        const userParts = user.split(/\s+/).filter(Boolean);

        return expected
            .split(/\s+/)
            .filter(Boolean)
            .map(word => {
                const safeWord = escapeHtml(word);

                if (userParts.includes(word)) {
                    return `<span class="jpdb-ok">${safeWord}</span>`;
                }

                const matchingPart = userParts.find(part =>
                    part.length >= 3 && word.includes(part)
                );

                if (matchingPart) {
                    const index = word.indexOf(matchingPart);

                    const before = escapeHtml(word.slice(0, index));
                    const match = escapeHtml(word.slice(index, index + matchingPart.length));
                    const after = escapeHtml(word.slice(index + matchingPart.length));

                    return `${before}<span class="jpdb-ok">${match}</span><span class="jpdb-missing">${after}</span>`;
                }

                return `<span class="jpdb-missing">${safeWord}</span>`;
            })
            .join(" ");
    }

    function getBestMeaning(userMeaning, correctMeanings) {
        if (!correctMeanings.length) return "";

        const userWords = new Set(
            normalizeMeaning(userMeaning)
                .split(/\s+/)
                .filter(w => w.length >= 3)
        );

        let best = correctMeanings[0];
        let bestScore = -1;

        for (const meaning of correctMeanings) {
            const words = normalizeMeaning(meaning)
                .split(/\s+/)
                .filter(Boolean);

            const score = words.filter(w => userWords.has(w)).length;

            if (score > bestScore) {
                bestScore = score;
                best = meaning;
            }
        }

        return best;
    }

    function getRecommendation(readingResult, meaningResult) {
        const readingCorrect = readingResult.startsWith("✅");

        const meaningCorrect =
            meaningResult.startsWith("✅") ||
            meaningResult.startsWith("🟡");

        if (!readingCorrect && !meaningCorrect) {
            return {
                text: "1 Nothing",
                className: "jpdb-rec-bad"
            };
        }

        if (readingCorrect && !meaningCorrect) {
            return {
                text: "2 Something",
                className: "jpdb-rec-mid"
            };
        }

        if (!readingCorrect && meaningCorrect) {
            return {
                text: "3 Hard",
                className: "jpdb-rec-hard"
            };
        }

        return {
            text: "4 Okay / 5 Easy",
            className: "jpdb-rec-good"
        };
    }

    function getReveal() {
        return document.querySelector(".review-reveal");
    }

    function getShowButton() {
        return (
            document.querySelector("#show-answer") ||
            [...document.querySelectorAll("button, a")]
                .find(el => /show answer|answer/i.test(el.textContent || ""))
        );
    }

    function getDisplayedWord() {
        const candidates = [...document.querySelectorAll(".plain, a.plain")]
            .map(el => ({
                el,
                text: (el.textContent || "")
                    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
                    .trim(),
                fontSize: parseFloat(getComputedStyle(el).fontSize) || 0
            }))
            .filter(x =>
                x.text &&
                x.text.length <= 30 &&
                /[\u3040-\u30ff\u3400-\u9fff]/.test(x.text)
            )
            .sort((a, b) => {
                if (b.fontSize !== a.fontSize) return b.fontSize - a.fontSize;
                return a.text.length - b.text.length;
            });

        return candidates[0]?.text || "";
    }

    function isKanaOnlyWord() {
        const word = getDisplayedWord()
            .replace(/[ー]/g, "");

        return word.length > 0 && /^[\u3040-\u309f\u30a0-\u30ff]+$/.test(word);
    }

    function readingFromElement(el) {
        let result = "";

        el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();

                if (tag === "rt" || tag === "rp") return;

                if (tag === "ruby") {
                    const rt = node.querySelector("rt");

                    if (rt && rt.textContent.trim()) {
                        result += rt.textContent.trim();
                    } else {
                        result += [...node.childNodes]
                            .filter(child =>
                                child.nodeType === Node.TEXT_NODE ||
                                (
                                    child.nodeType === Node.ELEMENT_NODE &&
                                    !["rt", "rp"].includes(child.tagName.toLowerCase())
                                )
                            )
                            .map(child => child.textContent || "")
                            .join("");
                    }

                    return;
                }

                result += readingFromElement(node);
            }
        });

        return result;
    }

    function getCorrectReading(reveal) {
        const answerBox = reveal.querySelector(".answer-box") || reveal;

        const wordBox =
            answerBox.querySelector(".plain") ||
            answerBox;

        if (!wordBox) return "";

        const rawReading = readingFromElement(wordBox);

        return normalizeReading(rawReading);
    }

    function getCorrectMeanings(reveal) {
        const meanings = [];

        const meaningRoot =
            reveal.querySelector(".subsection-meanings") ||
            [...reveal.querySelectorAll("*")]
                .find(el => /^meanings$/i.test((el.textContent || "").trim()))
                ?.parentElement;

        if (meaningRoot) {
            meaningRoot.querySelectorAll("li, .description").forEach(el => {
                const text = normalizeMeaning(el.textContent)
                    .replace(/^\d+\s+/, "");

                if (text) meanings.push(text);
            });
        }

        return [...new Set(meanings)];
    }

    function classifyReading(user, correct) {
        user = normalizeReading(user);
        correct = normalizeReading(correct);

        if (!correct) return "⚠️ nicht gefunden";
        if (user === correct) return "✅ richtig";
        if (correct.includes(user) || user.includes(correct)) return "🟡 teilweise richtig";

        return "❌ falsch";
    }

    function classifyMeaning(user, correctList) {
        user = normalizeMeaning(user);

        if (!correctList.length) return "⚠️ nicht gefunden";

        if (correctList.some(c => c === user)) {
            return "✅ richtig";
        }

        if (
            user.length >= 3 &&
            correctList.some(c => c.includes(user) || user.includes(c))
        ) {
            return "🟡 teilweise richtig";
        }

        return "❌ falsch";
    }

    function addStyle() {
        if (document.querySelector("#jpdb-check-style")) return;

        const style = document.createElement("style");
        style.id = "jpdb-check-style";

        style.textContent = `
            #jpdb-check-box {
                max-width: 620px;
                margin: 18px auto;
                padding: 14px;
                border: 1px solid #666;
                border-radius: 10px;
                text-align: center;
            }

            #jpdb-check-box input {
                display: block;
                width: 100%;
                box-sizing: border-box;
                margin: 8px 0;
                padding: 10px;
                font-size: 17px;
                text-align: center;
            }

            #jpdb-check-box input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #jpdb-reading-preview {
                margin-top: -4px;
                margin-bottom: 8px;
                opacity: 0.85;
                font-size: 18px;
                min-height: 24px;
            }

            #jpdb-check-box button {
                margin-top: 8px;
                padding: 8px 18px;
                font-weight: bold;
                cursor: pointer;
            }

            #jpdb-check-box button:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            #jpdb-check-result {
                margin-top: 12px;
                font-weight: bold;
                line-height: 1.5;
            }

            #jpdb-check-result small {
                display: block;
                margin-top: 10px;
                font-weight: normal;
                opacity: 0.95;
            }

            .jpdb-ok {
                background: rgba(60,180,90,0.35);
                color: #8cffaa;
                padding: 1px 4px;
                border-radius: 4px;
                margin: 1px;
                display: inline-block;
            }

            .jpdb-missing {
                background: rgba(220,60,60,0.35);
                color: #ff9a9a;
                padding: 1px 4px;
                border-radius: 4px;
                margin: 1px;
                display: inline-block;
            }

            .jpdb-extra {
                background: rgba(220,150,40,0.35);
                color: #ffd28a;
                padding: 1px 4px;
                border-radius: 4px;
                margin: 1px;
                display: inline-block;
            }

            .jpdb-highlight-line {
                margin-top: 6px;
            }

            .jpdb-recommendation {
                margin-top: 14px;
                padding: 10px;
                border-radius: 8px;
                font-weight: bold;
                font-size: 18px;
            }

            .jpdb-rec-bad {
                background: rgba(220,60,60,0.25);
                color: #ff9a9a;
            }

            .jpdb-rec-mid {
                background: rgba(220,60,60,0.25);
                color: #ff9a9a;
            }

            .jpdb-rec-hard {
                background: rgba(213,105,42,0.25);
                color: #ff711f;
            }

            .jpdb-rec-good {
                background: rgba(60,180,90,0.25);
                color: #8cffaa;
            }
        `;

        document.head.appendChild(style);
    }

    function getTarget() {
        return (
            document.querySelector(".bugfix") ||
            document.querySelector(".review-card") ||
            document.querySelector("main") ||
            document.body
        );
    }

    function stopJpdbKeybinds(input) {
        ["keydown", "keyup", "keypress"].forEach(type => {
            input.addEventListener(type, e => {
                e.stopPropagation();

                if (e.key !== "Enter" && e.key !== "Tab") {
                    e.stopImmediatePropagation();
                }
            }, true);
        });
    }

    function createInputBox() {
        if (getReveal()) return;
        if (document.querySelector("#jpdb-check-box")) return;

        addStyle();

        const box = document.createElement("div");
        box.id = "jpdb-check-box";

        box.innerHTML = `
            <input id="jpdb-reading-input" placeholder="Lesung">
            <div id="jpdb-reading-preview"></div>
            <input id="jpdb-meaning-input" placeholder="Bedeutung">
            <button id="jpdb-check-button" disabled>Prüfen</button>
            <div id="jpdb-check-result">Bitte Bedeutung eingeben.</div>
        `;

        getTarget().appendChild(box);

        const reading = box.querySelector("#jpdb-reading-input");
        const readingPreview = box.querySelector("#jpdb-reading-preview");
        const meaning = box.querySelector("#jpdb-meaning-input");
        const button = box.querySelector("#jpdb-check-button");
        const result = box.querySelector("#jpdb-check-result");

        stopJpdbKeybinds(reading);
        stopJpdbKeybinds(meaning);

        function update() {
            const kanaOnly = isKanaOnlyWord();

            reading.disabled = kanaOnly;
            reading.placeholder = kanaOnly
                ? "Keine Lesung nötig"
                : "Lesung";

            if (kanaOnly) {
                reading.value = "";
                readingPreview.textContent = "→ keine Lesung nötig";
                result.textContent = "Bitte Bedeutung eingeben.";
            } else {
                readingPreview.textContent = reading.value.trim()
                    ? "→ " + normalizeReading(reading.value)
                    : "";
                result.textContent = "Bitte Lesung und Bedeutung eingeben.";
            }

            button.disabled =
                meaning.value.trim() === "" ||
                (!kanaOnly && reading.value.trim() === "");
        }

        reading.addEventListener("blur", () => {
            if (!isKanaOnlyWord()) {
                reading.value = normalizeReading(reading.value);
            }
            update();
        });

        function submit() {
            update();

            if (button.disabled) return;

            const kanaOnly = isKanaOnlyWord();

            if (!kanaOnly) {
                reading.value = normalizeReading(reading.value);
            }

            localStorage.setItem(KEY_READING, kanaOnly ? KANA_ONLY_MARKER : reading.value);
            localStorage.setItem(KEY_MEANING, meaning.value);
            localStorage.setItem(KEY_PENDING, "1");

            result.textContent = "Antwort wird aufgedeckt…";

            const showButton = getShowButton();

            if (!showButton) {
                result.textContent = "⚠️ jpdb-Button zum Aufdecken nicht gefunden.";
                return;
            }

            showButton.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        }

        reading.addEventListener("input", update);
        meaning.addEventListener("input", update);

        reading.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (!isKanaOnlyWord()) {
                    reading.value = normalizeReading(reading.value);
                }
                update();
                meaning.focus();
            }
        });

        meaning.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                submit();
            }
        });

        button.addEventListener("click", submit);

        update();

        setTimeout(() => {
            if (isKanaOnlyWord()) {
                meaning.focus();
            } else {
                reading.focus();
            }
        }, 50);
    }

    function createResultBox() {
        const reveal = getReveal();

        if (!reveal) return;
        if (document.querySelector("#jpdb-check-box")) return;
        if (localStorage.getItem(KEY_PENDING) !== "1") return;

        addStyle();

        const storedReading = localStorage.getItem(KEY_READING) || "";
        const kanaOnly = storedReading === KANA_ONLY_MARKER;

        const correctReading = getCorrectReading(reveal);

        const userReading = kanaOnly
            ? correctReading
            : normalizeReading(storedReading);

        const userMeaning = normalizeMeaning(
            localStorage.getItem(KEY_MEANING) || ""
        );

        const correctMeanings = getCorrectMeanings(reveal);

        const bestMeaning = getBestMeaning(
            userMeaning,
            correctMeanings
        );

        const readingResult = kanaOnly
            ? "✅ richtig"
            : classifyReading(
                userReading,
                correctReading
            );

        const meaningResult = classifyMeaning(
            userMeaning,
            correctMeanings
        );

        const recommendation = getRecommendation(
            readingResult,
            meaningResult
        );

        const box = document.createElement("div");
        box.id = "jpdb-check-box";

        box.innerHTML = `
            <div id="jpdb-check-result">
                Lesung: ${readingResult}${kanaOnly ? " <small>(Kana-Wort)</small>" : ""}<br>
                Bedeutung: ${meaningResult}<br>

                <small>
                    Deine Lesung: ${kanaOnly ? "keine Eingabe nötig" : escapeHtml(userReading)}<br>
                    Erwartete Lesung:
                    <div class="jpdb-highlight-line">
                        ${highlightReading(userReading, correctReading)}
                    </div>

                    <br>

                    Deine Bedeutung:
                    ${escapeHtml(userMeaning)}<br>

                    Erwartete Bedeutung:
                    <div class="jpdb-highlight-line">
                        ${highlightMeaning(userMeaning, bestMeaning)}
                    </div>
                </small>

                <div class="jpdb-recommendation ${recommendation.className}">
                    Empfehlung: ${recommendation.text}
                </div>
            </div>
        `;

        reveal.prepend(box);

        localStorage.removeItem(KEY_PENDING);
    }

    function run() {
        createInputBox();
        createResultBox();
    }

    const observer = new MutationObserver(() => {
        setTimeout(run, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    run();

})();
