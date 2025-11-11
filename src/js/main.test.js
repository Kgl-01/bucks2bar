// JavaScript - src/js/main.test.js
const usernameRegex = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9]).{8,}$/

describe("usernameRegex", () => {
  const validUsernames = [
    "Password1!", // uppercase, number, allowed special, >8
    "Ab1!cdef", // exactly 8 chars, contains A, 1, !
    "Passw0rd@", // uppercase, 0, @
    "X9$abcdefg", // uppercase, number, allowed special, long
  ]

  const invalidUsernames = [
    "", // empty
    "password1!", // no uppercase
    "PASSWORD!", // no number
    "Password1", // no allowed special
    "Pass1!", // too short
    "Password1%", // '%' is not in allowed special set !@#$&*
    "Abcdefgh", // missing number and special
  ]

  test.each(validUsernames)("accepts valid username: %s", (input) => {
    expect(usernameRegex.test(input)).toBe(true)
  })

  test.each(invalidUsernames)("rejects invalid username: %s", (input) => {
    expect(usernameRegex.test(input)).toBe(false)
  })
})
