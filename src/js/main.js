document.addEventListener("DOMContentLoaded", () => {
  //input with id "username" on change
  const usernameInput = document.getElementById("username")

  if (usernameInput) {
    /**
     * Validates the username input against security requirements.
     *
     * Checks if the username contains at least one uppercase letter, one special character,
     * one number, and is at least 8 characters long. Updates the input border color to
     * indicate validation status (red for invalid, green for valid).
     *
     * @param {Event} event - The input event object from the username field
     * @returns {void}
     */
    function usernameInputCallback(event) {
      const username = event.target.value

      //regex to check if username has atleast 1 capital letter, 1 special character, 1 number and is atleast 8 characters long
      const usernameRegex = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9]).{8,}$/
      if (!usernameRegex.test(username)) {
        //set the username input border to red
        usernameInput.style.borderColor = "red"
      } else {
        usernameInput.style.borderColor = "green"
      }
    }

    usernameInput.addEventListener("input", usernameInputCallback)
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]

  const incomeIds = [
    "jan-income",
    "feb-income",
    "mar-income",
    "apr-income",
    "may-income",
    "jun-income",
    "jul-income",
    "aug-income",
    "sep-income",
    "oct-income",
    "nov-income",
    "dec-income",
  ]
  const expenseIds = [
    "jan-expenses",
    "feb-expenses",
    "mar-expenses",
    "apr-expenses",
    "may-expenses",
    "jun-expenses",
    "jul-expenses",
    "aug-expenses",
    "sep-expenses",
    "oct-expenses",
    "nov-expenses",
    "dec-expenses",
  ]

  const ctx = document.getElementById("b2bBarChart")?.getContext?.("2d")
  let b2bChart = null

  function readValues(ids) {
    return ids.map((id) => {
      const el = document.getElementById(id)
      const v = el ? parseFloat(el.value) : NaN
      return Number.isFinite(v) ? v : 0
    })
  }

  function renderChart() {
    if (!ctx) return
    const incomes = readValues(incomeIds)
    const expenses = readValues(expenseIds)

    const data = {
      labels: months,
      datasets: [
        {
          label: "Income",
          data: incomes,
          backgroundColor: "rgba(54, 162, 235, 0.7)",
        },
        {
          label: "Expenses",
          data: expenses,
          backgroundColor: "rgba(255, 99, 132, 0.7)",
        },
      ],
    }

    const config = {
      type: "bar",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
        },
      },
    }

    if (b2bChart) b2bChart.destroy()
    b2bChart = new Chart(ctx, config)
  }

  // render when Chart tab is shown
  const chartTabButton = document.getElementById("chart-tab")
  if (chartTabButton) {
    chartTabButton.addEventListener("shown.bs.tab", () => {
      renderChart()
    })
  }

  // optional: re-render when any input changes so the chart updates live
  ;[...incomeIds, ...expenseIds].forEach((id) => {
    const el = document.getElementById(id)
    if (el)
      el.addEventListener("input", () => {
        // only update if chart already exists (user opened Chart tab)
        if (b2bChart) renderChart()
      })
  })

  // download chart as PNG (keeps good resolution by scaling with devicePixelRatio)
  function downloadChartImage(
    filename = "bucks2bar-chart.png",
    scale = window.devicePixelRatio || 1
  ) {
    const srcCanvas = document.getElementById("b2bBarChart")
    if (!srcCanvas) return

    // create a temporary canvas scaled for higher resolution
    const tmp = document.createElement("canvas")
    tmp.width = srcCanvas.width * scale
    tmp.height = srcCanvas.height * scale
    const tmpCtx = tmp.getContext("2d")
    tmpCtx.setTransform(scale, 0, 0, scale, 0, 0) // scale drawing
    tmpCtx.drawImage(srcCanvas, 0, 0)

    // convert to blob and trigger download
    tmp.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      },
      "image/png",
      1
    )
  }

  const downloadBtn = document.getElementById("downloadChartBtn")
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      // ensure chart rendered before download; renderChart() exists above
      if (!b2bChart) renderChart()
      // small timeout ensures Chart.js finished drawing
      setTimeout(() => downloadChartImage(), 50)
    })
  }

  const sendEmailBtn = document.querySelector("#send-email")
  sendEmailBtn.addEventListener("click", async (e) => {
    console.log("Hello")
    const srcCanvas = document.getElementById("b2bBarChart")
    if (!srcCanvas) return alert("Chart not available")
    if (!b2bChart) renderChart()

    // create a temporary high-res canvas (same approach as download)
    const tmp = document.createElement("canvas")
    const scale = window.devicePixelRatio || 1
    tmp.width = srcCanvas.width * scale
    tmp.height = srcCanvas.height * scale
    const tmpCtx = tmp.getContext("2d")
    tmpCtx.setTransform(scale, 0, 0, scale, 0, 0)
    tmpCtx.drawImage(srcCanvas, 0, 0)

    // get base64 PNG
    const dataUrl = tmp.toDataURL("image/png", 1)
    const base64 = dataUrl.split(",")[1]

    const toEmail = document.getElementById("email-address").value

    // POST JSON to server; server expects { to, filename, data }
    try {
      const res = await fetch("http://localhost:3000/send-chart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // include an API key header if your server requires it
          // ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({
          to: toEmail,
          filename: "bucks2bar-chart.png",
          data: base64,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) alert("Email sent")
      else alert("Send failed: " + (json.error || res.statusText))
    } catch (err) {
      console.error(err)
      alert("Network error sending email")
    }
  })
})
