# Add a filter box to narrow the task list

Fixture for rehearsing the preview path without GitHub:

    npm run repro:local -- --mode preview --issue-file examples/pull-request.md

Adds a **Filter tasks…** box above the list. Typing in it narrows the list to
the tasks whose name contains what you typed, updating on every keystroke —
there is no button to press.

Filtering is display-only. Each row keeps its real position in the underlying
list, so Delete still acts on the task you can see rather than on whatever
happens to be at that offset in the filtered view.

When nothing matches, the panel says **No tasks match that filter.** rather than
going blank, so an empty result is distinguishable from an empty list.

Clearing the box brings every task back.
