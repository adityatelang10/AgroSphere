# PlantVillage disease subset

## Source and license

- Dataset: **PlantVillage Dataset**, original RGB/color images
- Maintainer repository: https://github.com/spMohanty/PlantVillage-Dataset
- Maintainer Hugging Face release: https://huggingface.co/datasets/mohanty/PlantVillage
- Paper: *Using Deep Learning for Image-Based Plant Disease Detection* (Mohanty et al., 2016)
- License identified by the maintainer's Hugging Face dataset card: **CC BY-SA 3.0**

The source reports 54,306 healthy and diseased leaf images across 38 crop-condition
classes. `dataset_manifest.json` records the exact count exposed by the downloaded
official split files, every selected source path, local path, leaf group, split, SHA-256,
format, dimensions, and class distribution used by AgroSphere.

## AgroSphere disease-v1 subset

Task 4 deliberately uses a deterministic, balanced 15-class subset covering Bell Pepper,
Potato, and Tomato. It uses 100 training, 20 validation, and 20 test images per class.
The official leaf-grouped test side stays separate. Validation leaf groups are selected
only from the official training side, and exact file hashes are checked across splits.

Run dataset preparation from `ml-service` with:

```powershell
python -m training.prepare_disease_dataset
```

## Important limitations

- PlantVillage images were captured mainly against simple, controlled backgrounds; field
  photos can differ significantly.
- Only the 15 documented Bell Pepper, Potato, and Tomato classes are supported.
- An unsupported plant or condition will still be forced into one of the known classes;
  this is closed-set classification, not universal disease recognition.
- Multiple conditions can produce visually similar symptoms, and image quality affects
  the result.
- Model confidence is not laboratory confirmation or guaranteed correctness.
