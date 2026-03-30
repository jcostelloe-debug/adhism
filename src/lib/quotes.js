// Daily quotes — rotated by day-of-year
const quotes = [
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Small steps every day lead to big results.", author: "Anonymous" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "It's not about having time. It's about making time.", author: "Anonymous" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Progress, not perfection.", author: "Anonymous" },
  { text: "One task at a time. One day at a time.", author: "Anonymous" },
];

export function getDailyQuote() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return quotes[dayOfYear % quotes.length];
}
