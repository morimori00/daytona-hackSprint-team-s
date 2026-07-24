# Deleting a task removes the wrong one

Reported by QA during regression testing.

**Steps to reproduce**

1. Open the app at `/`
2. The list shows three tasks: "Buy milk", "Walk the dog", "Write the report"
3. Click the **Delete** button on the row for "Walk the dog"

**What should happen**

"Walk the dog" is removed and the other two tasks remain.

**What actually happens**

"Walk the dog" is still there, and "Buy milk" disappears instead. The wrong row
is deleted.

**Environment**

Chrome, desktop. Happens every time, no special setup needed.
