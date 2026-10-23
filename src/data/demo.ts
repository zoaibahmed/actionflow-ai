// Static examples used only in the public landing-page illustration.
export const demoTasks = [
  {
    id: 1,
    title: "Finish the product proposal",
    category: "Work",
    priority: "High",
    time: "10:00 AM",
    completed: false,
  },
  {
    id: 2,
    title: "Review design feedback",
    category: "Work",
    priority: "High",
    time: "11:30 AM",
    completed: false,
  },
  {
    id: 3,
    title: "Read a chapter of Atomic Habits",
    category: "Personal",
    priority: "Low",
    time: "1:00 PM",
    completed: false,
  },
  {
    id: 4,
    title: "Prepare for the team catch-up",
    category: "Work",
    priority: "Medium",
    time: "2:00 PM",
    completed: false,
  },
  {
    id: 5,
    title: "Morning walk & a little fresh air",
    category: "Personal",
    priority: "Low",
    time: "8:00 AM",
    completed: true,
  },
];
export const schedule = [
  {
    time: "09:00",
    period: "AM",
    title: "Deep work",
    detail: "Product proposal",
    duration: "90 min",
    kind: "indigo",
  },
  {
    time: "11:30",
    period: "AM",
    title: "Design review",
    detail: "Review & leave feedback",
    duration: "30 min",
    kind: "amber",
  },
  {
    time: "02:00",
    period: "PM",
    title: "Team catch-up",
    detail: "Weekly project check-in",
    duration: "45 min",
    kind: "green",
  },
];
export const features = [
  {
    icon: "capture",
    title: "Smart Capture",
    description:
      "A screenshot. A quick thought. A place to turn scattered information into clear next steps.",
    note: "Capture the thought",
  },
  {
    icon: "tasks",
    title: "Task Management",
    description:
      "Keep your priorities in sight, check off the small wins, and make room for what matters.",
    note: "Find your focus",
  },
  {
    icon: "bell",
    title: "Smart Reminders",
    description:
      "A little help remembering the right thing at the right time. Fewer loose ends to carry.",
    note: "Let go of the mental tabs",
  },
  {
    icon: "spark",
    title: "AI Daily Planning",
    description:
      "Bring your tasks and available time together into a more thoughtful plan for the day.",
    note: "Make space for your day",
  },
] as const;
