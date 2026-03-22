name: douyin-creator-tools
description: A skill to automate interactions with the Douyin Creator platform, such as publishing articles.

commands:
  - name: publish-article
    description: Publishes a text-and-image (图文) article to Douyin.
    args:
      - name: title
        type: string
        description: "The title of the article (up to 30 characters)."
        required: true
      - name: content
        type: string
        description: "The main body content of the article (up to 8000 characters)."
        required: true
      - name: imagePath
        type: string
        description: "The absolute local file path for the article's cover image."
        required: true
      - name: subtitle
        type: string
        description: "A short summary or subtitle for the article (optional)."
      - name: music
        type: string
        description: "The name of a song to search for and add as background music (optional)."
      - name: tags
        type: array
        description: "A list of up to 5 tags for the article (optional)."
      - name: dryRun
        type: boolean
        description: "If true, fills the form but pauses before the final publish step for manual review. Defaults to false."
      - name: headless
        type: boolean
        description: "If true, runs the browser in headless mode. Defaults to false."
    script: |
      #!/usr/bin/env os
      # shebang for openclaw skill runner

      # Create a temporary JSON file with the article data
      JSON_PAYLOAD=$(mktemp)

      # Use 'jq' to safely build the JSON object from arguments
      jq -n \
        --arg title "$title" \
        --arg content "$content" \
        --arg imagePath "$imagePath" \
        --arg subtitle "${subtitle:-""}" \
        --arg music "${music:-""}" \
        --argjson tags "$(printf '%s\n' "${tags:-[]}" | jq -R . | jq -s .)" \
        '{title: $title, subtitle: $subtitle, content: $content, imagePath: $imagePath, music: $music, tags: $tags}' > "$JSON_PAYLOAD"

      echo "Article data prepared at: $JSON_PAYLOAD"
      cat "$JSON_PAYLOAD"

      # Construct the command-line arguments for the script
      SCRIPT_ARGS=()
      if [[ "$dryRun" == "true" ]]; then
        SCRIPT_ARGS+=("--dry-run")
      fi
      if [[ "$headless" == "true" ]]; then
        SCRIPT_ARGS+=("--headless")
      fi
      SCRIPT_ARGS+=("$JSON_PAYLOAD")

      # Execute the publishing script
      # Use `exec` so the script can be logged and monitored
      cd "{{SKILL_DIR}}"
      exec "src/publish-douyin-article.mjs" "${SCRIPT_ARGS[@]}"

      # The temporary file is cleaned up automatically by the OS
