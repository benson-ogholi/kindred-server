// utils/pickupCodeGenerator.js

const generatePickupCode = (senderName = "", recipientName = "") => {
  // Extract only letters and convert to uppercase
  let senderLetters = senderName.replace(/[^a-zA-Z]/g, "").toUpperCase();

  let recipientLetters = recipientName.replace(/[^a-zA-Z]/g, "").toUpperCase();

  // Scramble (shuffle) the letters randomly
  const shuffle = (str) => {
    return str
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  };

  // Take up to 4 letters after shuffling, pad if less than 4
  const senderPart = shuffle(senderLetters).slice(0, 4).padEnd(4, "X");

  const recipientPart = shuffle(recipientLetters).slice(0, 4).padEnd(4, "Z");

  // Random 4-digit number
  const randomNum = Math.floor(1000 + Math.random() * 9000);

  // Final format: XXXX-XXXX-XXXX
  return `${senderPart}-${randomNum}-${recipientPart}`;
};

module.exports = { generatePickupCode };
