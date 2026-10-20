const choose = document.querySelector("#choose"),
  button = document.querySelector("#record"),
  status = document.querySelector("#status");
let stream;
if (!navigator.mediaDevices?.getDisplayMedia) {
  choose.disabled = true;
  status.textContent =
    "Selected-tab capture is unavailable in this browser. The recording has not started.";
}
choose.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: 20 },
      audio: false,
      selfBrowserSurface: "exclude",
    });
    choose.disabled = true;
    button.disabled = false;
    status.textContent =
      "Sharing is ready. The timer has not started. Reply ready in the chat.";
  } catch (e) {
    status.textContent = "Sharing was not started: " + e.message;
  }
});
button.addEventListener("click", () => {
  if (!stream) return;
  const chunks = [],
    recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
      videoBitsPerSecond: 1800000,
    });
  button.disabled = true;
  let seconds = 0;
  status.textContent = "Recording 0 / 90 seconds";
  const timer = setInterval(() => {
    seconds++;
    status.textContent = "Recording " + seconds + " / 90 seconds";
  }, 1000);
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = async () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = "Saving the continuous recording…";
    try {
      const r = await fetch("/recording", {
          method: "POST",
          headers: {
            "Content-Type": "video/webm",
            "X-Switchyard-Recording": "1",
          },
          body: new Blob(chunks, { type: "video/webm" }),
        }),
        p = await r.json();
      status.textContent = p.saved
        ? "Saved " + p.name + " (" + p.bytes + " bytes)."
        : "The recording could not be saved.";
    } catch {
      status.textContent = "The recording could not be saved.";
    }
  };
  recorder.start(1000);
  setTimeout(() => {
    if (recorder.state === "recording") recorder.stop();
  }, 90000);
});
