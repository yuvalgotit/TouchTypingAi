// because we allow arrow movments, now we aren't catching errors after the user went back

const HISTORY_KEY = "typingHistory";
const NEXT_SENTENCE_KEY = "nextSentence";
const PRACTICE_TOPIC_KEY = "practiceTopic"

const WELCOME_SENTENCE = "hey i am your ai typing coach i follow every key you type and make new sentences to help with weak points you can also choose a topic or say hi to my creator yuval below"
const NO_ERROS_INSTRUCTION = "Finish without mistakes for the AI to analyze your typing"
const tabableElements = ["INPUT", "BUTTON", "A"]

let keystrokes = [];
let lastPressTime = null;
let sentence = ""
let runFinished = false

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const practiceTopicInput = document.getElementById("practiceTopicInput");
    const clearHistoryButton = document.getElementById("clearHistoryButton")
    const outputElement = document.getElementById("output");
    const wpmElement = document.getElementById("wpm")
    const instructionLabel = document.getElementById("instructionLabel")

    function focusInput() {
        if (document.activeElement != hiddenInput && !tabableElements.includes(document.activeElement.tagName)) {
            hiddenInput.focus()
        }
        requestAnimationFrame(focusInput)
    }

    setTimeout(() => {
        focusInput()
    }, 60)

    outputElement.addEventListener(("click"), () => {
        hiddenInput.blur()
    })

    hiddenInput.addEventListener("focus", () => {
        outputElement.classList.add("focused")
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
            lastKeystroke.error = true;
            lastKeystroke.expected = sentence[charPosition]
        }

        render()
        if (hiddenInput.value.length < sentence.length) {
            instructionLabel.textContent = ""
        }
        else if (hiddenInput.value === sentence) {
            runFinishedSuccessfully()
        }
        else {
            instructionLabel.textContent = NO_ERROS_INSTRUCTION
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

        // handle extra characters beyond the sentence
        const extraChars = hiddenInput.value.length - sentence.length;
        for (let j = 0; j < extraChars; j++) {
            const span = document.createElement('span');
            const char = hiddenInput.value[sentence.length + j]
            span.className = "error overflowing";
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
        try {
            const res = await fetch("/generate-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentence,
                    keystrokes,
                    performanceHistory: getPerformanceHistory(),
                    practiceTopic: practiceTopicInput.value
                })
            });
            const data = await res.json();
            newSentence(data.sentence)
            saveRun(data.performanceTxt)
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
});

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
    if (history.length > 2) history = history.slice(-2);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    sessionStorage.setItem(PRACTICE_TOPIC_KEY, practiceTopicInput.value)
}

function getPerformanceHistory() {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
}

function isRTL(text) {
    const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlChars.test(text);
}

