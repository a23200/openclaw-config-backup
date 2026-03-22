# Douyin Image-Text Publishing Skill

This skill automates the process of publishing image-text posts on Douyin using browser automation.

## Plan

The process follows the steps identified in the user-provided screenshot of the Douyin creator studio.

1.  **Navigate to the Post Page**: Open the browser and go to `https://creator.douyin.com/creator-micro/content/post/image`.
2.  **Upload Image(s)**: Locate the image upload element and provide the path to the image(s).
3.  **Fill in Description**:
    -   Target the text area for the post's description (作品描述).
    -   Input the title and body text provided by the user.
    -   Optionally, add relevant hashtags.
4.  **Set Cover Image**:
    -   Usually, the first uploaded image is the default cover.
    -   If necessary, implement logic to select a specific cover image.
5.  **Configure Extended Information (Optional)**:
    -   **Add Music**: Click "选择音乐" and select a suitable track.
    -   **Add Location**: Click "添加地点" and input the location.
6.  **Configure Publish Settings**:
    -   **Visibility**: Set "谁可以看" (Public, Friends, Private). Default is Public.
    -   **Publish Time**: Set "发布时间" (Immediately or Scheduled). Default is Immediately.
7.  **Publish**: Click the final "发布" button to submit the post.

## CLI Usage

A CLI tool could be created to wrap this logic.

```sh
douyin-publish --type image-text \
  --image "/path/to/image.jpg" \
  --description "This is my post description. #hashtag" \
  --location "Shanghai"
```
