const PERFORMANCE_HISTORY_KEY = "performanceHistory";
const NEXT_SENTENCE_KEY = "nextSentence";
const PRACTICE_TOPIC_KEY = "practiceTopic"
const SYMBOLS_CHECKBOX_KEY = "symbols"
const NUMBERS_CHECKBOX_KEY = "numbers"

const WELCOME_SENTENCE = "start by typing this sentence so flam can learn your typing style"
const NO_MISTYPES_INSTRUCTION = "Finish without mistakes"
const AI_NOTES_PLACEHOLDER = "Hey, my name is Flam and I'll be your typing coach. Every round I'll create a new sentence for you to type based on what I think you should focus on."
const AI_NOTES_LOADING = "Thinking..."
const AI_NOTES_LOADING_NEW_TOPIC = "Creating a new sentence for the topic "
const DEFAULT_PRACTICE_TOPIC = 'english'

const tabableElements = ["INPUT", "BUTTON", "A"]

let keystrokes = [];
let lastPressTime = null;
let sentence = ""
let runFinished = false

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const practiceTopicInput = document.getElementById("practiceTopicInput");
    const clearHistoryButton = document.getElementById("clearHistoryButton")
    const showMobileKeyboardBtn = document.getElementById("showMobileKeyboardBtn")
    const resetBtn = document.getElementById("resetBtn");
    const outputElement = document.getElementById("output");
    const instructionLabel = document.getElementById("instructionLabel")
    const socialsElement = document.getElementById("socials")
    const symbolsCheckbox = document.getElementById("symbols")
    const numbersCheckbox = document.getElementById("numbers")

    let prev = ''

    function focusInput() {
        if (document.activeElement != hiddenInput && !tabableElements.includes(document.activeElement.tagName) && !document.body.classList.contains('flam')) {
            socialsElement.classList.remove("focused")
            hiddenInput.focus()
        } else if (document.activeElement.parentElement === socialsElement) {
            socialsElement.classList.add("focused")
        } else {
            socialsElement.classList.remove("focused")
        }
        if (prev != document.activeElement) {
            prev = document.activeElement
        }
        requestAnimationFrame(focusInput)
    }

    focusInput();

    document.body.addEventListener("click", () => {
        if (document.body.classList.contains('flam') && !document.body.classList.contains('loading') && !tabableElements.includes(document.activeElement.tagName)) {
            document.body.classList.remove('flam')
            // we focus here for mobile
            outputElement.classList.add("focused")
            hiddenInput.focus()
        }
    });

    document.body.addEventListener("keydown", (e) => {
        if (document.body.classList.contains('flam') && !document.body.classList.contains('loading')) {
            document.body.classList.remove('flam')
            e.preventDefault();
            // we don't focus here so tab will work and we let requestAnimationFrame do his thing
        } else if (document.body.classList.contains('loading') && e.key === "Tab") {
            e.preventDefault();
        }
    })

    hiddenInput.addEventListener("focus", () => {
        outputElement.classList.add("focused")
        hiddenInput.selectionStart = hiddenInput.value.length
        render()
    })
    hiddenInput.addEventListener("blur", () => {
        outputElement.classList.remove("focused")
    })

    practiceTopicInput.value = localStorage.getItem(PRACTICE_TOPIC_KEY) || DEFAULT_PRACTICE_TOPIC

    symbolsCheckbox.checked = localStorage.getItem(SYMBOLS_CHECKBOX_KEY) === 'false' ? false : true
    numbersCheckbox.checked = localStorage.getItem(NUMBERS_CHECKBOX_KEY) === 'false' ? false : true

    clearHistoryButton.addEventListener("click", () => {
        localStorage.clear();
        practiceTopicInput.value = DEFAULT_PRACTICE_TOPIC
        symbolsCheckbox.checked = true
        numbersCheckbox.checked = true
        document.body.className = "flam firstTime"
        reset();
        setTimeout(function () {
            clearHistoryButton.blur()
        }, 0)
    })

    const handlePracticeTopicInputChange = () => {
        if (practiceTopicInput.value === "" || practiceTopicInput.value.length < 4) {
            practiceTopicInput.value = DEFAULT_PRACTICE_TOPIC
        }
        if (practiceTopicInput.value != (localStorage.getItem(PRACTICE_TOPIC_KEY) || DEFAULT_PRACTICE_TOPIC)) {
            localStorage.setItem(PRACTICE_TOPIC_KEY, practiceTopicInput.value)

            document.body.classList.add('flam')
            outputElement.classList.remove("focused")
            hiddenInput.blur()

            regenerateNextSentence()
        }
    };

    practiceTopicInput.addEventListener("blur", handlePracticeTopicInputChange);
    practiceTopicInput.addEventListener("change", handlePracticeTopicInputChange);


    showMobileKeyboardBtn.addEventListener("click", (e) => {
        hiddenInput.focus()

        // Find the element under the click, ignoring the button itself
        showMobileKeyboardBtn.style.pointerEvents = "none";
        const el = document.elementFromPoint(e.clientX, e.clientY);
        showMobileKeyboardBtn.style.pointerEvents = "auto";

        // move cursor to the clicked letter for mobile users that want to fix a past mistype
        if (el && el.tagName === "SPAN" && hiddenInput.value) {
            const index = Array.from(output.children).indexOf(el);
            hiddenInput.selectionEnd = index
            render()
        }
    })

    resetBtn.addEventListener("click", () => {
        reset()
        hiddenInput.focus()
    })

    hiddenInput.addEventListener("keydown", (event) => {
        if (event.key.length !== 1 && event.key !== "Backspace") {
            return; // skip keys like shift and arrows to not pollute our array
        }

        const now = performance.now()

        const isFirstKey = (keystrokes.length === 0)
        if (isFirstKey || lastPressTime === null) {
            lastPressTime = now;
        }

        keystrokes.push({
            delta: Math.round(now - lastPressTime),
            key: event.key,
            cursor: hiddenInput.selectionStart,
            lengthSoFar: hiddenInput.value.length
        });

        lastPressTime = now
    });

    hiddenInput.addEventListener('beforeinput', (event) => {
        const PasteTypes = ['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation'];
        if (PasteTypes.includes(event.inputType)) {
            event.preventDefault();
        }

        if (event.inputType != 'insertText' && event.inputType != 'deleteContentBackward' && keystrokes.length) {
            keystrokes.at(-1).action = event.inputType;
        }
    });

    hiddenInput.addEventListener('input', () => {
        const charPosition = hiddenInput.selectionStart - 1

        if (hiddenInput.value[charPosition] != sentence[charPosition] && keystrokes.at(-1).key != 'Backspace') {
            const lastKeystroke = keystrokes.at(-1);
            lastKeystroke.mistyped = true;
            lastKeystroke.expected = sentence[charPosition] ?? 'overflow' // this will be ignored since we are filtering chars that aren't length of 1
        }

        render()
        if (hiddenInput.value === sentence) {
            runFinishedSuccessfully()
        }
        if (sentence.indexOf(hiddenInput.value) === 0) {
            instructionLabel.textContent = ""
        }
        else if (hiddenInput.value.length > sentence.length
            || hiddenInput.value.slice(-7) == sentence.slice(charPosition - 6, charPosition + 1)  // there is an mistype and the last 7 chars are correct
            || getTotalUnfixedMistypes() > 7
        ) {
            instructionLabel.textContent = NO_MISTYPES_INSTRUCTION
        }
        else if (instructionLabel.textContent != "" && sentence.indexOf(hiddenInput.value) === 0) {
            // only if the mistypes were cleared
            instructionLabel.textContent = ""
        }
    });

    hiddenInput.addEventListener('keyup', (event) => {
        render()
        if (hiddenInput.value === "") {
            reset()
        }
        else if (hiddenInput.value.length === 1) {
            // in the case of the user selects all the text and replace it with one char,
            // we never reach length 1 but we need to reset the keystroke array
            // since we already pushed this char, we will extract it and reset his delta
            let lastKeyStroke = keystrokes.at(-1)
            lastKeyStroke.delta = 0
            keystrokes = [lastKeyStroke]
        }
    });

    symbolsCheckbox.addEventListener('change', () => {
        localStorage.setItem(SYMBOLS_CHECKBOX_KEY, symbolsCheckbox.checked)
        reset()
    })

    numbersCheckbox.addEventListener('change', () => {
        localStorage.setItem(NUMBERS_CHECKBOX_KEY, numbersCheckbox.checked)
        reset()
    })

    reset();

    function reset() {
        keystrokes = [];
        hiddenInput.value = "";

        sentence = localStorage.getItem(NEXT_SENTENCE_KEY) || WELCOME_SENTENCE;

        if (!symbolsCheckbox.checked) {
            sentence = sentence
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, "") // remove non letter symbols
                .replace(/\s{2,}/g, " ")  // clear double spaces
                .trim()
        }

        if (!numbersCheckbox.checked) {
            sentence = sentence
                .replace(/[0-9]/g, "") // clear numbers
                .replace(/\s{2,}/g, " ") // clear double spaces
                .trim()
        }

        if (isRTL(sentence)) {
            document.body.classList.add("rtl")
        } else {
            document.body.classList.remove("rtl")
        }

        outputElement.innerHTML = sentence.split('').map(c => `<span>${c}</span>`).join('') + '<span class="last">@</span>'
        outputElement.querySelector('span').className = 'cursor'
        instructionLabel.textContent = ""
        renderPerformance()
        runFinished = false

        if (document.body.classList.contains("firstTime") && localStorage.getItem(PERFORMANCE_HISTORY_KEY) != null) {
            document.body.classList.remove('firstTime')
        }

        render()
    }

    function render() {
        const overFlowingSpansToRemove = outputElement.querySelectorAll('.overflowing');
        overFlowingSpansToRemove.forEach(span => {
            span.remove();
        });

        const spans = outputElement.querySelectorAll('span')
        spans.forEach((s, i) => {
            if (i == sentence.length) {
                s.className = "last"
            }
            else if (i >= hiddenInput.value.length) {
                s.className = ""
            }
            else if (s.textContent === hiddenInput.value[i]) {
                s.className = "correct"
            }
            else {
                s.className = "mistype"
                s.setAttribute("data-pressed", hiddenInput.value[i]);
            }

            if (hiddenInput.selectionStart < hiddenInput.selectionEnd) {
                if (i >= hiddenInput.selectionStart && i < hiddenInput.selectionEnd) {
                    s.className += " selection"
                }
            } else if (i === hiddenInput.selectionStart) {
                s.className += " cursor"
            }
        })

        // handle extra characters beyond the sentence
        const extraChars = hiddenInput.value.length - sentence.length;
        for (let j = 0; j < extraChars; j++) {
            const span = document.createElement('span');
            const char = hiddenInput.value[sentence.length + j]
            span.className = "mistype overflowing";
            span.textContent = char
            span.setAttribute("data-pressed", char);
            outputElement.insertBefore(span, outputElement.querySelector('.last'));
        }
    }

    function runFinishedSuccessfully() {
        if (!runFinished) { // to prevent mutiple api calls 
            instructionLabel.textContent = ""

            document.body.classList.add('flam')
            outputElement.classList.remove("focused")
            hiddenInput.blur()

            const performance = generatePerformance()

            if (document.body.classList.contains("firstTime")) {
                document.body.classList.remove('firstTime')
            }

            generateNextSentence(performance)
            runFinished = true
        }
    }

    async function generateNextSentence(performance) {
        document.body.classList.add('loading')
        document.querySelector("#ainotes").innerHTML = AI_NOTES_LOADING
        document.getElementById("accuracy").textContent = performance.accuracy
        document.getElementById("wpm").textContent = performance.wpm

        const problematicKeys = getProblematicKeys()
        const performanceHistory = getPerformanceHistory()
        const practiceTopic = practiceTopicInput.value

        try {
            const res = await fetch("/generate-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentence,
                    problematicKeys: problematicKeys,
                    performanceHistory: performanceHistory,
                    practiceTopic: practiceTopic,
                    performance: performance,
                })
            });
            const data = await res.json();
            savePerformanceHistory(data.aiNote || '', performance)
            newSentence(data.sentence)
        } catch (err) {
            console.error("Server error:", err);
            // fallback
            savePerformanceHistory("Flam is unreachable at the moment, greetings from the developer", performance)
            newSentence("There is no internet or the server is unreachable. Either way you somehow got to this text. so nice to meet you, Yuval the developer. (BTW this was written on a flight to Poland with no wifi)")
        } finally {
            document.body.classList.remove('loading')
        }
    }

    async function regenerateNextSentence() {
        document.body.classList.add('loading')

        const performanceHistory = getPerformanceHistory()
        const practiceTopic = practiceTopicInput.value

        document.querySelector("#ainotes").innerHTML = AI_NOTES_LOADING_NEW_TOPIC + practiceTopic + "..."
        document.getElementById("accuracy").textContent = performanceHistory.at(-1)?.accuracy || 0
        document.getElementById("wpm").textContent = performanceHistory.at(-1)?.wpm || 0

        try {
            const res = await fetch("/regenerate-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    performanceHistory: performanceHistory,
                    practiceTopic: practiceTopic,
                })
            });
            const data = await res.json();
            newSentence(data.sentence)
            document.querySelector("#ainotes").innerHTML = "New sentence created"
        } catch (err) {
            console.error("Server error:", err);
            // fallback
            newSentence("There is no internet or the server is unreachable. Either way you somehow got to this text. so nice to meet you, Yuval the developer. (BTW this was written on a flight to Poland with no wifi)")
        } finally {
            document.body.classList.remove('loading')
        }
    }

    function newSentence(newSentence) {
        sentence = newSentence
        localStorage.setItem(NEXT_SENTENCE_KEY, newSentence);

        reset()
    }

    function renderPerformance() {
        let historyForAllTopics = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || {};
        let performanceHistory = historyForAllTopics[practiceTopicInput.value] || []
        if (performanceHistory.length) {
            const latestPerformance = performanceHistory.at(-1);
            document.querySelector("#ainotes").innerHTML = latestPerformance.notes
            document.getElementById("accuracy").textContent = latestPerformance.accuracy
            document.getElementById("wpm").textContent = latestPerformance.wpm
        } else {
            document.querySelector("#ainotes").innerHTML = AI_NOTES_PLACEHOLDER
        }
    }

    function getTotalUnfixedMistypes() {
        const minLength = Math.min(hiddenInput.value.length, sentence.length);
        let totalMistypes = 0;

        for (let i = 0; i < minLength; i++) {
            if (hiddenInput.value[i] !== sentence[i]) {
                totalMistypes++;
            }
        }

        return totalMistypes;
    }

    // preloading this so it won't flick for the first time
    const preloadImage = new Image();
    preloadImage.src = 'yourIdeasFocused.png';
});

function getProblematicKeys() {
    const keystrokesWithoutLongPauses = keystrokes
        .map((k, i) => { return { ...k, originalIndex: i } })
        .filter(k => k.delta < 3000 && k.cursor === k.lengthSoFar); // also filtering out those that weren't typed when the cursor was at the end

    const avgDelta = keystrokesWithoutLongPauses.reduce((acc, k) => acc + k.delta, 0) / keystrokesWithoutLongPauses.length;
    const variance = keystrokesWithoutLongPauses.reduce((acc, k) => acc + Math.pow(k.delta - avgDelta, 2), 0) / keystrokesWithoutLongPauses.length;
    const stdDev = Math.sqrt(variance);

    const slowKeysAndMistypedKeys = keystrokesWithoutLongPauses
        .filter(k =>
            ((k.delta > avgDelta + 2 * stdDev) || k.mistyped) && k.key.length == 1
        )

    const enrichedSlowKeysAndMistypedKeys = slowKeysAndMistypedKeys
        .map(k => {
            let speed = 'normal';
            if (k.delta > avgDelta + 3 * stdDev) speed = "slowest";
            else if (k.delta > avgDelta + 2.5 * stdDev) speed = "slower";
            else if (k.delta > avgDelta + 2 * stdDev) speed = "slow";
            else if (k.delta < avgDelta - 3 * stdDev) speed = "fastest";
            else if (k.delta < avgDelta - 2.5 * stdDev) speed = "faster";
            else if (k.delta < avgDelta - 2 * stdDev) speed = "fast";

            let mapped = {
                key: k.key,
                speed,
                precedingKeys: keystrokes
                    .slice(0, k.originalIndex) // take everything before this keystroke
                    .filter(pk => pk.key.length === 1) // keep only real characters
                    .slice(-4) // take the last 4 chars
                    .map(pk => pk.key)
            };
            if (k.mistyped) {
                mapped.mistyped = true
                mapped.expected = k.expected
            }
            return mapped
        })

    return enrichedSlowKeysAndMistypedKeys
}

function generatePerformance() {
    const charsWritten = hiddenInput.value.length;
    const totalMistypes = keystrokes.filter(k => k.mistyped).length

    // --- Accuracy ---
    const accuracy = charsWritten > 0
        ? Math.round(Math.max(0, ((charsWritten - totalMistypes) / charsWritten) * 100))
        : 100;

    // --- Consistency ---
    const validKeystrokes = keystrokes.filter(k => k.delta < 3000 && k.cursor === k.lengthSoFar); // ignore long pauses or chars in the middle
    let consistency = getConsistencyRolling(validKeystrokes, 5);

    // --- WPM ---
    const totalTimeMs = keystrokes.reduce((acc, k) => acc + k.delta, 0);
    const minutes = totalTimeMs / 60000;
    const wpm = minutes > 0 ? Math.round((charsWritten / 5) / minutes) : 0;

    return {
        accuracy,
        consistency,
        wpm,
    }
}

function getConsistencyRolling(keystrokes, windowSize = 5) {
    if (keystrokes.length < windowSize) return 100;

    const wpmSamples = [];

    for (let i = 0; i <= keystrokes.length - windowSize; i++) {
        // sum deltas for this window
        const time = keystrokes
            .slice(i, i + windowSize)
            .reduce((a, k) => a + k.delta, 0);

        const minutes = time / 60000;
        const wpm = (windowSize / 5) / minutes; // 5 chars = 1 word
        wpmSamples.push(wpm);
    }

    if (wpmSamples.length < 2) return 100;

    const mean = wpmSamples.reduce((a, b) => a + b, 0) / wpmSamples.length;
    const variance = wpmSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / wpmSamples.length;
    const stdDev = Math.sqrt(variance);

    const cv = stdDev / mean;
    return Math.round(Math.max(0, Math.min(100, 100 - cv * 100)));
}

function savePerformanceHistory(aiNotes, performance) {
    let historyForAllTopics = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || {};
    let performanceHistory = historyForAllTopics[practiceTopicInput.value] || []

    performanceHistory.push({ ...performance, notes: aiNotes });
    if (performanceHistory.length > 4) performanceHistory = performanceHistory.slice(-5);

    historyForAllTopics[practiceTopicInput.value] = performanceHistory
    localStorage.setItem(PERFORMANCE_HISTORY_KEY, JSON.stringify(historyForAllTopics));
}

function getPerformanceHistory() {
    let historyForAllTopics = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || {};
    const performanceHistory = historyForAllTopics[practiceTopicInput.value] || []
    return performanceHistory.slice(-4)
}

function isRTL(text) {
    const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlChars.test(text);
}
