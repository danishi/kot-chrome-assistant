// --- 打刻リマインダー ---
const ALARM_CLOCK_IN = 'reminderClockIn';
const ALARM_CLOCK_OUT = 'reminderClockOut';

const setupReminders = () => {
  chrome.storage.sync.get([
    'reminderEnabled',
    'reminderClockInTime',
    'reminderClockOutTime'
  ], (items) => {
    // 既存のアラームをクリア
    chrome.alarms.clear(ALARM_CLOCK_IN);
    chrome.alarms.clear(ALARM_CLOCK_OUT);

    if (!items.reminderEnabled) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (items.reminderClockInTime) {
      const [h, m] = items.reminderClockInTime.split(':').map(Number);
      const clockInDate = new Date(today.getTime() + h * 3600000 + m * 60000);
      // 既に過ぎていたら翌日にセット
      if (clockInDate <= now) {
        clockInDate.setDate(clockInDate.getDate() + 1);
      }
      chrome.alarms.create(ALARM_CLOCK_IN, { when: clockInDate.getTime(), periodInMinutes: 1440 });
    }

    if (items.reminderClockOutTime) {
      const [h, m] = items.reminderClockOutTime.split(':').map(Number);
      const clockOutDate = new Date(today.getTime() + h * 3600000 + m * 60000);
      if (clockOutDate <= now) {
        clockOutDate.setDate(clockOutDate.getDate() + 1);
      }
      chrome.alarms.create(ALARM_CLOCK_OUT, { when: clockOutDate.getTime(), periodInMinutes: 1440 });
    }
  });
};

const showNotification = (id, message) => {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Myレコーダーアシスタント',
    message: message,
    priority: 2
  });
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_CLOCK_IN) {
    showNotification(ALARM_CLOCK_IN, '出勤打刻の時間です。');
  } else if (alarm.name === ALARM_CLOCK_OUT) {
    showNotification(ALARM_CLOCK_OUT, '退勤打刻の時間です。');
  }
});

// 通知クリック時にMyレコーダーを開く
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === ALARM_CLOCK_IN || notificationId === ALARM_CLOCK_OUT) {
    chrome.storage.sync.get(['s3Selected', 's4Selected', 'samlSelected'], (items) => {
      let subdomain = 's2';
      if (items.s3Selected) subdomain = 's3';
      else if (items.s4Selected) subdomain = 's4';
      const recorder = items.samlSelected ? 'recorder2' : 'recorder';
      const url = `https://${subdomain}.ta.kingoftime.jp/independent/${recorder}/personal/`;
      chrome.tabs.create({ url });
    });
    chrome.notifications.clear(notificationId);
  }
});

// 設定変更時にアラームを再セットアップ
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.reminderEnabled || changes.reminderClockInTime || changes.reminderClockOutTime)) {
    setupReminders();
  }
});

const postRequest = (endpoint, headers, body, sendResponse) => {
  fetch(endpoint, {
    'method': 'POST',
    'headers': headers,
    'body': body
  })
    .then((res) => res.json())
    .then((res) => {
      if (res && res.ok) {
        sendResponse({ 'status': 'success' });
      } else {
        console.error(JSON.stringify(res));
        sendResponse({ 'status': 'failed' });
      }
    })
    .catch((err) => {
      console.error(err);
      sendResponse({ 'status': 'failed' });
    });
};

const validateEndpoint = (endpoint) => {
  const whitelist = [
    'https://slack.com/api/chat.postMessage',
    'https://slack.com/api/users.profile.set',
    'https://hooks.slack.com/services/',
  ]
  return whitelist.some((l) => endpoint.startsWith(l));
};

const setPopup = (enabled) => {
  chrome.action.setPopup({ popup: enabled ? 'src/browser_action/browser_action.html' : '' });
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) {
    sendResponse({ 'status': 'listener is missing.\n' + msg });
    return true;
  }

  if (msg.contentScriptQuery === 'testReminder') {
    showNotification('reminderTest', 'これはテスト通知です。打刻リマインダーが正しく動作しています。');
    sendResponse({ 'status': 'success' });
    return true;
  }

  if (msg.contentScriptQuery === 'postMessage' && validateEndpoint(msg.endpoint)) {
    postRequest(msg.endpoint, msg.headers, msg.body, sendResponse)
    return true;
  }

  if (msg.contentScriptQuery === 'changeStatus' && validateEndpoint(msg.endpoint)) {
    postRequest(msg.endpoint, msg.headers, msg.body, sendResponse)
    return true;
  }

  sendResponse({ 'status': 'listener is missing.\n' + msg });
  return true;
});


chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get('openInNewTab', function (data) {
    setPopup(!data.openInNewTab);
  });
  setupReminders();
});

chrome.runtime.onStartup.addListener(function () {
  chrome.storage.sync.get('openInNewTab', function (data) {
    setPopup(!data.openInNewTab);
  });
  setupReminders();
});

chrome.action.onClicked.addListener(function () {
  let myrecUrl = "https://s2.ta.kingoftime.jp/independent/recorder/personal/";

  chrome.storage.sync.get(["openInNewTab", "s3Selected", "s4Selected", "samlSelected"], (items) => {
    setPopup(!items.openInNewTab);

    if (items.openInNewTab) {
      if (items.s3Selected || items.s4Selected || items.samlSelected) {
        let subdomain = "s2";
        if (items.s3Selected) {
          subdomain = "s3";
        } else if (items.s4Selected) {
          subdomain = "s4";
        }
        const recorder = !items.samlSelected ? "recorder" : "recorder2"

        myrecUrl = `https://${subdomain}.ta.kingoftime.jp/independent/${recorder}/personal/`;

      }
      chrome.tabs.query({ url: myrecUrl, currentWindow: true }, function (tabs) {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true, url: myrecUrl }).catch(function (e) { console.log(e.message) });
        } else {
          chrome.tabs.create({ url: myrecUrl }).catch(function (e) { console.log(e.message) });
        }
      });
    }
  });
});
