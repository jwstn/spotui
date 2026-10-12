document.querySelectorAll("[data-quiz]").forEach((quiz) => {
  const feedback = quiz.querySelector("[data-feedback]")
  quiz.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const correct = button.dataset.answer === "correct"
      feedback.dataset.state = correct ? "correct" : "wrong"
      feedback.textContent = correct
        ? "Correct. Now explain why in your own words."
        : "Not quite. Re-read the distinction between returning an Effect and yielding it."
    })
  })
})
