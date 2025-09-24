// because we allow arrow movments, now we aren't catching mistypes after the user went back
// shift can take a lot of time but the char after it won't and we ignore it
// in a sequence of errors, isn't only the first letter really matter?

const PERFORMANCE_HISTORY_KEY = "performanceHistory";
const NEXT_SENTENCE_KEY = "nextSentence";
const PRACTICE_TOPIC_KEY = "practiceTopic"

const WELCOME_SENTENCE = "welcome to the future of typing, where flam ai listens to you type and creates new sentences to help you improve."
const NO_MISTYPES_INSTRUCTION = "Finish without mistakes for the AI to analyze your typing"
const AI_NOTES_PLACEHOLDER = "Hey I'm Flam, your AI typing coach. Write your first sentence to get started"
const AI_NOTES_LOADING = "Thinking..."

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
    const wpmElement = document.getElementById("wpm")
    const instructionLabel = document.getElementById("instructionLabel")
    const socialsElement = document.getElementById("socials")

    function focusInput() {
        if (document.activeElement != hiddenInput && !tabableElements.includes(document.activeElement.tagName)) {
            socialsElement.classList.remove("focused")
            hiddenInput.focus()
        } else if (document.activeElement.parentElement === socialsElement) {
            socialsElement.classList.add("focused")
        } else {
            socialsElement.classList.remove("focused")
        }
        requestAnimationFrame(focusInput)
    }

    outputElement.classList.add("focused")
    focusInput()

    hiddenInput.addEventListener("focus", () => {
        outputElement.classList.add("focused")
        hiddenInput.selectionStart = hiddenInput.selectionEnd
    })
    hiddenInput.addEventListener("blur", () => {
        outputElement.classList.remove("focused")
    })

    practiceTopicInput.value = sessionStorage.getItem(PRACTICE_TOPIC_KEY) || ""

    clearHistoryButton.addEventListener(("click"), () => {
        localStorage.clear();
        sessionStorage.clear();
        practiceTopicInput.value = ""
        reset();

        clearHistoryButton.classList.add('clicked');
        hiddenInput.focus()
        setTimeout(() => {
            clearHistoryButton.classList.remove('clicked');
        }, 200);
    })

    showMobileKeyboardBtn.addEventListener(("click"), () => {
        hiddenInput.focus()
    })

    resetBtn.addEventListener(("click"), () => {
        reset()
        hiddenInput.focus()
    })

    hiddenInput.addEventListener("keydown", (event) => {
        const now = performance.now()

        const isFirstKey = (keystrokes.length === 0)
        if (isFirstKey || lastPressTime === null) {
            lastPressTime = now;
        }

        keystrokes.push({
            delta: Math.round(now - lastPressTime),
            key: event.key,
            cursor: hiddenInput.selectionStart
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
        else if (sentence.indexOf(hiddenInput.value) !== 0 &&
            (hiddenInput.value.length > sentence.length
                || hiddenInput.value.slice(-7) == sentence.slice(charPosition - 6, charPosition + 1) // there is an mistype and the last 7 chars are correct
                || getTotalMistypes() > 4)) {
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

    reset();

    function reset() {
        keystrokes = [];
        hiddenInput.value = "";

        sentence = localStorage.getItem(NEXT_SENTENCE_KEY) || WELCOME_SENTENCE;

        if (isRTL(sentence)) {
            document.body.classList.add("rtl")
        } else {
            document.body.classList.remove("rtl")
        }

        outputElement.innerHTML = sentence.split('').map(c => `<span>${c}</span>`).join('') + '<span class="last">@</span>'
        outputElement.querySelector('span').className = 'cursor'
        wpmElement.textContent = ""
        instructionLabel.textContent = ""
        renderPerformance()
        runFinished = false

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
            wpmElement.textContent = `${getWPM()} WPM`

            generateNextSentence()
            runFinished = true
        }
    }

    async function generateNextSentence() {
        document.body.classList.add('loading')
        document.querySelector("#ainotes").innerHTML = AI_NOTES_LOADING

        const problematicKeys = getProblematicKeys()
        const performanceHistory = getPerformanceHistory()
        const practiceTopic = practiceTopicInput.value
        const wpm = getWPM()

        try {
            const res = await fetch("/generate-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentence,
                    problematicKeys: problematicKeys,
                    performanceHistory: performanceHistory,
                    practiceTopic: practiceTopic,
                    wpm: wpm
                })
            });
            const data = await res.json();
            savePerformanceHistory(data.aiNote, wpm)
            newSentence(data.sentence)
        } catch (err) {
            console.error("Server error:", err);
            return sentence; // fallback
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
        let performanceHistory = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || [];
        if (performanceHistory.length) {
            const latestPerformance = performanceHistory.at(-1);
            document.querySelector("#ainotes").innerHTML = `${latestPerformance.notes} <span class='wpm'>(${latestPerformance.wpm} WPM)</span>`
        } else {
            document.querySelector("#ainotes").innerHTML = AI_NOTES_PLACEHOLDER
        }
    }

    function getTotalMistypes() {
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

// TODO: BUG? if I go back with the arrows and fix some key, the precedingKeys won't be correct right?

// 🎈🎈🎈 IDEA: maybe we still need to have pos on each element so the ai will see if the mistakes are on the same place of the sentence 🎈
function getProblematicKeys() {
    const keystrokesWithoutLongPauses = keystrokes
        .map((k, i) => { return { ...k, originalIndex: i } })
        .filter(k => k.delta < 3000);

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

function getWPM() {
    const CharsWrittenSoFar = hiddenInput.value.length;
    const totalTimeMs = keystrokes.reduce((accumulator, currentKeystroke) => {
        return accumulator + currentKeystroke.delta;
    }, 0);
    if (totalTimeMs === 0) return 0
    const minutes = totalTimeMs / 60000;
    const wpm = Math.round((CharsWrittenSoFar / 5) / minutes)

    return wpm
}

function savePerformanceHistory(aiNotes, wpm) {
    let performanceHistory = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || [];
    performanceHistory.push({ wpm: wpm, notes: aiNotes });

    if (performanceHistory.length > 4) performanceHistory = performanceHistory.slice(-5);

    localStorage.setItem(PERFORMANCE_HISTORY_KEY, JSON.stringify(performanceHistory));
    sessionStorage.setItem(PRACTICE_TOPIC_KEY, practiceTopicInput.value)
}

function getPerformanceHistory() {
    const performanceHistory = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY)) || [];
    return performanceHistory.slice(-4)
}

function isRTL(text) {
    const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlChars.test(text);
}

