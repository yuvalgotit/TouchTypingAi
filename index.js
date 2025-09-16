// TODO: add "clear all errors to complete" explanation text somewhere

const HISTORY_KEY = "typingHistory";
const NEXT_SENTENCE_KEY = "nextSentence";

let keystrokes = [];
let lastPressTime = null;
let sentence = localStorage.getItem(NEXT_SENTENCE_KEY) ||
    "Welcome! Each time you finish typing, your keystrokes are sent to an AI to craft the next sentence based on your weaknesses. You must finish without errors.";

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const userFocusInput = document.getElementById("userFocusInput");
    const outputElement = document.getElementById("output");
    const wpmElement = document.getElementById("wpm")

    function focusInput() {
        if (document.activeElement != hiddenInput && document.activeElement != userFocusInput) {
            hiddenInput.focus()
        }
        requestAnimationFrame(focusInput)
    }
    focusInput();

    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            reset()
        }
    });

    hiddenInput.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
        }
        const now = performance.now()

        const isFirstKey = (keystrokes.length === 0)
        if (isFirstKey || lastPressTime === null) {
            lastPressTime = now;
        }

        keystrokes.push({
            delta: Math.round(now - lastPressTime),
            key: event.key,
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
        const len = hiddenInput.value.length
        if (hiddenInput.value[len - 1] != sentence[len - 1] && keystrokes.at(-1).key != 'Backspace') {
            keystrokes.at(-1).error = true;
            keystrokes.at(-1).expected = sentence[len - 1]
        }

        render()
        if (hiddenInput.value === sentence) {
            runFinishedSuccessfully()
        }
    });

    hiddenInput.addEventListener('keyup', (event) => {
        render()
        if (hiddenInput.value === "") {
            reset()
        }
    });

    reset();

    function reset() {
        keystrokes = [];
        hiddenInput.value = "";
        outputElement.innerHTML = sentence.split('').map(c => `<span>${c}</span>`).join('') + '<span class="last">@</span>'
        outputElement.querySelector('span').className = 'cursor'
        wpmElement.textContent = ""

        render()
    }

    function render() {
        const spans = outputElement.querySelectorAll('span')
        spans.forEach((s, i) => {
            if (i + 1 == spans.length) {
                s.className = "last"
            }
            else if (i >= hiddenInput.value.length) {
                s.className = ""
            }
            else if (s.textContent === hiddenInput.value[i]) {
                s.className = "correct"
            }
            else {
                s.className = "error"
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
    }

    function runFinishedSuccessfully() {
        wpmElement.textContent = `${getWPM()} WPM`

        generateNextSentence()
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

    function saveRun(run) {
        let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        history.push(run);

        // since we are only sending a few to the LLM there is no reason to keep them on the local storage
        if (history.length > 10) history = history.slice(-10);

        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }

    function getRecentRuns(n = 3) {
        let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        return history.slice(-n);
    }

    async function generateNextSentence() {
        try {
            const recentRuns = getRecentRuns(3);

            const res = await fetch("/generate-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentence,
                    keystrokes,
                    performanceHistory: recentRuns,
                    userFocus: userFocusInput.value
                })
            });
            const data = await res.json();
            newSentence(data.sentence)
            saveRun(data.performanceTxt)
        } catch (err) {
            console.error("Server error:", err);
            return sentence; // fallback
        }
    }

    function newSentence(newSentence) {
        sentence = newSentence
        localStorage.setItem(NEXT_SENTENCE_KEY, newSentence);
        reset()
    }
});

