// ===== グローバル変数 =====
let quizData = []; // CSVから読み込んだ問題データを格納
let questionsStats = []; // 各問題の出題・正解履歴を格納 { questionIndex: number, timesAsked: number, correctCount: number }
let currentQuestionIndex = -1; // 現在表示している問題の、quizData配列内でのインデックス (-1は未設定状態)
let score = 0;
let uploadedFileName = ''; // アップロードされたCSVファイルの名前を保持
let papaParseLoaded = false; // PapaParseがロードされたかどうかのフラグ

// ===== DOM要素への参照 =====
const questionElement = document.getElementById('question');
const optionsAreaElement = document.getElementById('optionsArea');
const feedbackMessageElement = document.getElementById('feedbackMessage');
const feedbackVisualElement = document.getElementById('feedbackVisual');
const nextButton = document.getElementById('nextButton');
const uploadSection = document.getElementById('uploadSection');
const quizSection = document.getElementById('quizSection');
const restartButton = document.getElementById('restartButton');
const downloadResultsButton = document.getElementById('downloadResultsButton');
const csvFileInput = document.getElementById('csvFile');

// ===== ログ出力用関数 =====
function log(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`); // デバッグログを常に有効化
}

// ===== PapaParseのロード確認 =====
function checkPapaParseLoaded() {
    if (typeof Papa !== 'undefined') {
        papaParseLoaded = true;
        log('PapaParseライブラリがロードされました。');
    } else {
        log('PapaParseライブラリが見つかりません。CSVの読み込みに失敗する可能性があります。', 'warn');
    }
}

// ===== CSVファイル読み込み処理 =====
csvFileInput.addEventListener('change', handleFileUpload);

function handleFileUpload(event) {
    log('ファイル選択イベントが発生しました。');
    const file = event.target.files[0];
    if (!file) {
        log('ファイルが選択されていません。処理を中断します。', 'warn');
        return;
    }
    log(`ファイル選択: ${file.name}, タイプ: ${file.type}, サイズ: ${file.size} バイト`);
    uploadedFileName = file.name;

    checkPapaParseLoaded();
    if (!papaParseLoaded) {
        alert('CSVファイルを読み込むためのライブラリ（PapaParse）が見つかりません。ファイルを選択してもクイズを開始できません。');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        log('FileReaderのonloadイベントが発生しました。');
        let csvContent = e.target.result;

        // UTF-8 BOM を取り除く処理
        if (csvContent.startsWith('\uFEFF')) {
            log('UTF-8 BOM を検出したので除去します。');
            csvContent = csvContent.substring(1);
        }

        try {
            quizData = parseCSV(csvContent);
            log(`CSVをパースしました。${quizData.length}件の問題データを読み込みました。`);

            if (!validateQuizData(quizData)) {
                alert(`CSVファイルの形式に問題があります。\nConsoleに詳細なエラーメッセージが表示されていますので、そちらを確認して修正してください。`);
                csvFileInput.value = '';
                return;
            }

            questionsStats = quizData.map((data, index) => ({
                questionIndex: index,
                timesAsked: parseInt(data.timesAsked) || 0,
                correctCount: parseInt(data.correctCount) || 0
            }));
            log('問題の学習履歴を初期化しました。');

            selectNextQuestionIndex();

            uploadSection.style.display = 'none';
            quizSection.style.display = 'block';
            score = 0;
            nextButton.style.display = 'none';
            log('クイズ画面を表示します。');
            displayQuestion();
        } catch (error) {
            log(`CSVのパースまたは初期化中にエラーが発生しました: ${error}`, 'error');
            console.error(error);
            alert(`CSVファイルの読み込みまたは処理に失敗しました。\nエラー: ${error.message}\nConsoleに詳細なエラーメッセージが表示されていますので、そちらを確認してください。`);
            csvFileInput.value = '';
            quizData = [];
            questionsStats = [];
        }
    };
    reader.onerror = (e) => {
        log(`FileReaderのエラー: ${e}`, 'error');
        alert('ファイルの読み込みに失敗しました。');
        csvFileInput.value = '';
        quizData = [];
        questionsStats = [];
    };
    reader.readAsText(file);
}

// CSV文字列をパースしてオブジェクトの配列に変換する関数 (PapaParseを使用)
function parseCSV(csvString) {
    log('CSVパース処理を開始します (PapaParseを使用)。');
    let parsedResult = null;

    Papa.parse(csvString, {
        header: true, // 1行目をヘッダーとして扱う
        skipEmptyLines: true, // 空行はスキップ
        dynamicTyping: false, // 文字列として読み込む
        encoding: 'auto', // エンコーディングを自動判別させる
        complete: function(results) {
            log(`PapaParseによるパース完了。検出データ数: ${results.data.length}, エラー数: ${results.errors.length}`);
            if (results.errors.length > 0) {
                results.errors.forEach(err => {
                    log(`PapaParseエラー (Row: ${err.row}, Code: ${err.code}): ${err.message}`, 'error');
                });
                throw new Error(`CSVパース中に ${results.errors.length} 件のエラーが見つかりました。詳細をConsoleで確認してください。`);
            }
            parsedResult = results.data;
        },
        error: function(error) {
            log(`PapaParseのエラーハンドラが呼び出されました: ${error.message}`, 'error');
            throw new Error(`PapaParse処理中にエラーが発生しました: ${error.message}`);
        }
    });

    if (!parsedResult) {
        throw new Error("CSVのパースに失敗しました。PapaParseの実行結果が null です。");
    }
    
    // ヘッダー名の正規化（例：大文字小文字、空白の除去）
    // PapaParseは多くの場合これを自動で行いますが、念のため確認します。
    // CSVのヘッダー名とJSのキー名が異なる場合（例: 'Question ' vs 'question'）は、
    // ここでキー名を正規化するか、後続処理でヘッダー名を適切に参照する必要があります。
    // 今回は、PapaParseがヘッダーをそのままキーにするため、CSVのヘッダーと一致している必要があります。
    // 例: 'question', 'correct_answer' などの正確なヘッダー名がCSVにあることを前提とします。
    
    log(`CSVパース完了。${parsedResult.length}件のデータを取得しました。`);
    return parsedResult;
}

// CSVデータのバリデーション
function validateQuizData(data) {
    if (data.length === 0) {
        log('読み込まれたデータが空です。', 'warn');
        return false;
    }
    // PapaParseがヘッダーを認識してくれるため、headersの存在確認はrowオブジェクトのキーで代用
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // question が空でないかチェック
        if (!row.question || row.question.trim() === '') {
            log(`データ行 ${i+1}: 'question' が空です。問題文を入力してください。`, 'error'); return false;
        }
        // correct_answer が空でないかチェック
        if (!row.correct_answer || row.correct_answer.trim() === '') {
            log(`データ行 ${i+1}: 'correct_answer' が空です。正解を選択肢として入力してください。`, 'error'); return false;
        }
        
        // 少なくとも1つの誤答選択肢があるかチェック
        let hasAtLeastOneWrongOption = false;
        for (let k = 1; k <= 7; k++) {
            // ヘッダーに wrong_option が存在するか確認してからアクセス
            if (row.hasOwnProperty(`wrong_option${k}`) && row[`wrong_option${k}`] && row[`wrong_option${k}`].trim() !== '') {
                hasAtLeastOneWrongOption = true;
                break;
            }
        }
        if (!hasAtLeastOneWrongOption) {
            log(`データ行 ${i+1}: 少なくとも一つの誤答選択肢 ('wrong_option1'～'wrong_option7') が必要です。`, 'error'); return false;
        }

        // timesAsked と correctCount が数値であるかチェック
        try {
            const timesAskedVal = row.timesAsked;
            const correctCountVal = row.correctCount;

            const timesAsked = parseInt(timesAskedVal);
            const correctCount = parseInt(correctCountVal);

            if (isNaN(timesAsked)) {
                log(`データ行 ${i+1}: 'timesAsked' の値 '${timesAskedVal}' は数値ではありません。`, 'error'); return false;
            }
            if (isNaN(correctCount)) {
                log(`データ行 ${i+1}: 'correctCount' の値 '${correctCountVal}' は数値ではありません。`, 'error'); return false;
            }
            // timesAsked が correctCount より小さいという論理エラーチェック
            if (timesAsked < correctCount) {
                log(`データ行 ${i+1} で 'timesAsked' (${timesAsked}) よりも 'correctCount' (${correctCount}) が大きいです。`, 'error');
                return false;
            }
        } catch (e) {
            log(`データ行 ${i+1}: timesAsked または correctCount のパースエラー: ${e}`, 'error');
            return false;
        }
    }
    log('CSVデータの基本的なバリデーションを通過しました。');
    return true;
}

// ===== 問題選択ロジック =====
function selectNextQuestionIndex() {
    log('次の問題のインデックスを選択します。');
    // questionsStats と quizData の長さが一致しない場合の対応
    if (questionsStats.length !== quizData.length) {
        log(`questionsStats (${questionsStats.length}) と quizData (${quizData.length}) の長さが一致しません。`, 'error');
        // 配列を再生成して同期させる
        questionsStats = quizData.map((data, index) => ({
            questionIndex: index,
            timesAsked: parseInt(data.timesAsked) || 0,
            correctCount: parseInt(data.correctCount) || 0
        }));
        log('questionsStats を quizData の長さに合わせて再生成しました。');
    }

    const candidateStats = questionsStats.map(stat => ({
        ...stat,
        questionText: quizData[stat.questionIndex]?.question || 'Invalid Question',
        correctnessRate: stat.timesAsked === 0 ? -1 : stat.correctCount / stat.timesAsked
    }));

    const notAsked = candidateStats.filter(stat => stat.timesAsked === 0);
    let nextQuestionStat = null;

    if (notAsked.length > 0) {
        const randomIndex = Math.floor(Math.random() * notAsked.length);
        nextQuestionStat = notAsked[randomIndex];
        log(`未出題の問題 (${notAsked.length}件中) からランダムに選択: quizData index ${nextQuestionStat.questionIndex}`);
    } else {
        candidateStats.sort((a, b) => a.correctnessRate - b.correctnessRate);
        nextQuestionStat = candidateStats[0];
        log(`全問出題済み。正答率 ${nextQuestionStat.correctnessRate.toFixed(2)} の問題を選択: quizData index ${nextQuestionStat.questionIndex}`);
    }

    if (nextQuestionStat) {
        currentQuestionIndex = nextQuestionStat.questionIndex;
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // 修正箇所：元の questionsStats 配列の timesAsked を更新する
        const statsToUpdate = questionsStats.find(stat => stat.questionIndex === currentQuestionIndex);
        if (statsToUpdate) {
            statsToUpdate.timesAsked++;
            log(`次の出題問題は quizData[${currentQuestionIndex}] です。出題回数: ${statsToUpdate.timesAsked}`);
        } else {
            log(`統計情報が見つかりません: questionIndex ${currentQuestionIndex}`, 'error');
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    } else {
        log('次の問題を選択できませんでした。データがないか、エラーが発生しました。', 'error');
        alert('問題を選択できませんでした。CSVデータの形式を確認してください。');
        return;
    }
}

// ===== 選択肢のシャッフル =====
function shuffleOptions() {
    log(`問題 ${currentQuestionIndex} の選択肢をシャッフルします。`);
    const questionData = quizData[currentQuestionIndex];
    const options = [];
    // 正解を先に追加
    if (questionData.correct_answer && questionData.correct_answer.trim() !== '') {
        options.push({ text: questionData.correct_answer, isCorrect: true });
    }
    // 誤答を最大7つまで追加
    for (let i = 1; i <= 7; i++) {
        const wrongOptionText = questionData[`wrong_option${i}`];
        if (wrongOptionText && wrongOptionText.trim() !== "") {
            options.push({ text: wrongOptionText, isCorrect: false });
        }
    }

    if (options.length === 0) {
        log(`問題 "${questionData.question}" に有効な選択肢が一つもありません。`, 'error');
        questionData._shuffledOptions = [];
        return;
    }

    // Fisher-Yates (Knuth) Shuffle アルゴリズムでシャッフル
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    questionData._shuffledOptions = options;
    log(`選択肢をシャッフルし、${options.length}個の選択肢を準備しました。`);
}

// ===== 問題表示処理 =====
function displayQuestion() {
    log(`問題 ${currentQuestionIndex} を表示します。`);
    // currentQuestionIndex が不正な場合や全問題終了の場合
    if (currentQuestionIndex === -1 || currentQuestionIndex >= quizData.length) {
        log('全問題を表示しました。結果表示に移ります。');
        showResults();
        return;
    }

    const questionData = quizData[currentQuestionIndex];
    questionElement.textContent = questionData.question;
    optionsAreaElement.innerHTML = ''; // 前回の選択肢をクリア
    feedbackMessageElement.textContent = '';
    feedbackVisualElement.innerHTML = '';
    feedbackVisualElement.className = ''; // クラスをクリア
    nextButton.style.display = 'none'; // 次へボタンは最初は非表示

    shuffleOptions();
    const shuffledOptions = questionData._shuffledOptions || [];

    if (shuffledOptions.length === 0) {
        log(`問題 "${questionData.question}" に有効な選択肢がありません。スキップします。`, 'warn');
        nextButton.click(); // 有効な選択肢がない場合は自動的に次の問題へ
        return;
    }

    shuffledOptions.forEach((option, index) => {
        const button = document.createElement('button');
        button.textContent = option.text;
        button.classList.add('option-button');
        button.dataset.isCorrect = option.isCorrect;
        button.dataset.quizDataIndex = currentQuestionIndex; // どの問題の選択肢か分かるように

        button.addEventListener('click', handleAnswer);
        optionsAreaElement.appendChild(button);
    });
    log(`問題 "${questionData.question}" を表示しました。`);
}

// ===== 回答処理 =====
function handleAnswer(event) {
    const selectedButton = event.target;
    const isCorrect = selectedButton.dataset.isCorrect === 'true';
    const selectedQuizDataIndex = parseInt(selectedButton.dataset.quizDataIndex);

    log(`回答を受け付けました。選択されたのは: "${selectedButton.textContent}"`);

    const optionButtons = optionsAreaElement.querySelectorAll('.option-button');
    optionButtons.forEach(btn => {
        btn.removeEventListener('click', handleAnswer);
        btn.disabled = true;
        btn.style.cursor = 'default';
    });

    let feedbackMessage = '';
    let feedbackVisualClass = '';

    const currentQuestionStats = questionsStats.find(stat => stat.questionIndex === selectedQuizDataIndex);
    if (!currentQuestionStats) {
        log(`統計情報が見つかりません: questionIndex ${selectedQuizDataIndex}`, 'error');
        feedbackMessage = '内部エラーが発生しました。';
        feedbackVisualClass = 'incorrect-cross';
    } else {
        if (isCorrect) {
            score++;
            currentQuestionStats.correctCount++;
            feedbackMessage = '正解！';
            feedbackVisualClass = 'correct-circle';
            selectedButton.classList.add('correct');
            log('正解しました！');
        } else {
            feedbackMessage = '残念！不正解です。';
            selectedButton.classList.add('incorrect');
            optionButtons.forEach(btn => {
                if (btn.dataset.isCorrect === 'true') {
                    btn.classList.add('correct');
                }
            });
            feedbackVisualClass = 'incorrect-cross';
            log('不正解でした。');
        }
    }

    feedbackMessageElement.textContent = feedbackMessage;
    feedbackVisualElement.classList.add(feedbackVisualClass);

    nextButton.style.display = 'flex'; // 次へボタンを表示
    log('フィードバックを表示し、次へボタンを表示しました。');
}

// ===== 次の問題へ =====
nextButton.addEventListener('click', () => {
    log('「次の問題へ」ボタンがクリックされました。');
    if (currentQuestionIndex === -1 || quizData.length === 0) {
        log('問題が正しく読み込まれていないか、indexが不正です。', 'error');
        alert('問題の表示中にエラーが発生しました。CSVファイルを再選択してください。');
        restartQuiz();
        return;
    }

    selectNextQuestionIndex(); // 次の問題を選択
    displayQuestion(); // 次の問題を表示
    feedbackMessageElement.textContent = '';
    feedbackVisualElement.innerHTML = '';
    feedbackVisualElement.className = '';
    log(`次の問題 (index: ${currentQuestionIndex}) を表示します。`);
});

// ===== リスタート =====
restartButton.addEventListener('click', () => {
    log('「もう一度プレイ」ボタンがクリックされました。クイズをリセットします。');
    restartQuiz();
});

// クイズ全体をリセットする関数
function restartQuiz() {
    quizData = [];
    questionsStats = [];
    currentQuestionIndex = -1;
    score = 0;

    uploadSection.style.display = 'block';
    quizSection.style.display = 'none';
    csvFileInput.value = '';
    feedbackMessageElement.textContent = '';
    feedbackVisualElement.innerHTML = '';
    log('クイズ状態をリセットし、アップロード画面に戻りました。');
}


// ===== 学習履歴ダウンロード =====
function downloadResults() {
    log('「学習履歴をダウンロード」ボタンがクリックされました。');
    if (questionsStats.length === 0 || quizData.length === 0) {
        log('ダウンロードできる学習履歴データがありません。', 'warn');
        alert('ダウンロードできるデータがありません。クイズをプレイしてから再度試してください。');
        return;
    }

    // ダウンロード用のデータを作成
    const dataForDownload = quizData.map((originalData, index) => {
        const stats = questionsStats.find(stat => stat.questionIndex === index);
        if (stats) {
            return {
                ...originalData,
                timesAsked: stats.timesAsked,
                correctCount: stats.correctCount
            };
        }
        return originalData; // 念のため、statsが見つからない場合も元のデータを返す
    });
    
    // PapaParseのunparse機能を使用して、JSONからCSV文字列に変換
    // これにより、カンマを含むフィールドが自動的にダブルクォーテーションで囲まれる
    const csvString = Papa.unparse(dataForDownload, {
        header: true, // ヘッダー行を含める
        quotes: true // 常にフィールドをダブルクォーテーションで囲む
    });

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const downloadFilename = uploadedFileName || 'updated_quiz_data.csv';
    link.setAttribute('href', url);
    link.setAttribute('download', downloadFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    log('学習履歴CSVファイルを生成し、ダウンロードを開始しました。');
}

// downloadResultsButton にイベントリスナーを設定
downloadResultsButton.addEventListener('click', downloadResults);

// ===== 初期化処理 =====
log('スクリプトがロードされました。クイズを開始するにはCSVファイルを選択してください。');