# Contributing to a Git Repository: Step-by-Step Guide

This guide walks you through the process of creating a new branch, making changes, handling potential merge conflicts, and creating a pull request.

## 1. Fork and Create a New Branch

First, fork the repository and clone it locally.

Next, create a new branch to work on:

```bash
git checkout -b <new-branch-name>
```
> This creates a new branch for you to checkout to

## 2. Make Changes

Make your desired changes to the files in your branch. Once you're ready, follow the steps below:

## 2.1. Save Your Changes Temporarily (if needed)

If you suspect someone else has made changes to the same file or repo, and you need to incorporate their changes with yours before pushing:

```bash
git stash
```
> This saves your local changes temporarily and reverts the file to its previous state.

## 2.2. Pull the Latest Changes from Another Branch

Let’s assume the other branch containing some updates is called `test-branch`. If you feel that you want to get updates or incorporate changes from that branch into yours then you can pull changes after stashing -- 

```bash
git pull origin test-branch
```
 
> This incorporates changes from `test-branch` into your current branch, ensuring you have the latest updates.

## 2.3. Reapply Your Stashed Changes 

```bash
git stash apply
```
> Your changes will be applied on top of the updates pulled from `test-branch`.

## Handling Merge Conflicts

If you and the other contributor made changes to the same line, you'll encounter a merge conflict. It will look something like this:

```bash
<<<<<<< HEAD
Your changes
=======
Their changes
>>>>>>> test-branch
```

To resolve: 
* Remove the conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> test-branch`). 
* Decide which changes to keep: 
    * Keep both sets of changes. 
    * Keep only one version (yours or theirs).

After resolving conflicts, stage the changes:

```bash
git add .
```

or stage specific files:
```bash
git add <file-name>
```

## 2.5. Push Your Changes

```bash
git push origin <your-branch-name>
```

Now, go ahead and create a pull request to merge your changes into the main branch (upstream).

*** 

## 3. If No Other Changes Are Expected
If you're the only one working on the branch and you don't need to incorporate others' changes, simply:

Check which branch you are commiting to -- 
```bash 
git branch
```

If you are on the right branch then you can stage files -- staging files means you are accepting your changes to be put into container form for shipping

Stage fles using -- 

```bash
git add .
```

OR

```bash
git add <file-name>
```

Then push

```bash
git push origin <branch-name>
```

## 4. Create a Pull Request
After pushing, visit the repository on GitHub (or your Git platform) and open a pull request (PR) to merge your branch into the upstream branch (the default branch where finalized files are stored).

***
***

> By following these steps, you'll successfully contribute changes to the project while handling any potential conflicts professionally.