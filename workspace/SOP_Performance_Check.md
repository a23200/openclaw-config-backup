# SOP: Performance Troubleshooting

This document outlines the Standard Operating Procedure for diagnosing and resolving performance issues like slowness, unresponsiveness, or apparent degradation in reasoning quality.

## Step 1: Initial Diagnosis - The Triage Checklist

When performance issues are reported, run the following commands to get a quick overview of the system state.

1.  **Check Core Service & Model Status:**
    *   **Command:** `session_status`
    *   **What to look for:**
        *   `Model` line: Is there a fallback warning? Is it using an unexpected model?
        *   `Context`: Is the context window nearly full? This can sometimes increase latency.
        *   `Queue`: Is the agent stuck in a strange state?

2.  **Check System Resource Pressure:**
    *   **Command:** `top -l 1 | head -n 15`
    *   **What to look for:**
        *   `Load Avg`: High load average (e.g., consistently above the number of cores) indicates sustained CPU pressure.
        *   `PhysMem`: Look at `unused` memory. If it's very low (e.g., < 200M), the system is under memory pressure. High `compressor` usage is another indicator.
        *   `PID COMMAND %CPU`: Identify any processes (including `openclaw`) with unusually high or sustained CPU usage.

3.  **Check Disk Space:**
    *   **Command:** `df -h .`
    *   **What to look for:** Is the `Capacity` dangerously high (e.g., > 90%)? This is rarely the cause of slowness but is good hygiene to check.

4.  **Check Workspace Bloat:**
    *   **Command:** `du -sh .`
    *   **What to look for:** Is the total size of the workspace directory excessively large (e.g., > 1GB)? This can slow down startups and file-based operations.

## Step 2: Formulating Solutions

Based on the diagnosis, propose solutions targeting the identified bottlenecks.

1.  **If Memory Pressure is High:**
    *   **Primary Solution:** Restarting the OpenClaw service (`gateway restart`) is the most effective way for the agent to clear its own memory footprint.
    *   **Secondary Solution:** Advise the user to close other memory-intensive applications. Use the output of `top` to suggest specific applications.
    *   **Last Resort:** Advise a full system reboot.

2.  **If Model Fallback is Occurring:**
    *   **Temporary Fix:** Use `session_status(model="<correct_model_name>")` to override the model for the current session.
    *   **Permanent Fix:** The configuration file needs to be patched using `gateway config.patch` followed by a `gateway restart`.

3.  **If Workspace is Bloated:**
    *   **Action:** Use `du -sh * .[^.]* | sort -hr | head -n 10` to identify the largest subdirectories and files.
    *   **Proposal:** Propose deleting safe-to-remove items like temporary files (`temp_*`), old archives (`.zip`, `.gz`), and tool caches (`.playwright`).
    *   **Safety:** Always ask for user confirmation before deleting files. Use the `trash` command instead of `rm` where available.

## Step 3: Proactive Monitoring

To prevent recurrence, establish a proactive monitoring mechanism.

*   **Action:** Create a `cron` job to run a lightweight health check daily.
*   **Cron Job Logic:** The job should run a script that executes the diagnostic commands from Step 1 and parses the output.
*   **Alerting:** If any metric crosses a predefined threshold (e.g., available memory < 5%, load average > 4.0 for 5 mins), the job should generate a system event to proactively alert the user in the main session.
