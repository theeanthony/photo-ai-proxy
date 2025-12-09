Hyperspectral Imaging for Mushroom Dry Matter Content Classification

Project Overview

This project explores the use of hyperspectral imaging data to predict the dry matter content of mushrooms. Dry matter content is a critical quality indicator for agricultural products like mushrooms, influencing their shelf-life, nutritional value, and economic worth. Standard RGB photography is insufficient for this task, as it lacks the spectral depth to capture chemical compositions. Hyperspectral imaging, which records light intensity across hundreds of narrow, continuous spectral bands, offers a non-invasive method to infer these chemical properties.

The core objective is to classify mushroom samples into different quality categories based on their dry matter content using spectral data. We employ a Convolutional Neural Network (CNN) for this multi-class classification task, addressing challenges such as high dimensionality and class imbalance.

Dataset

The dataset, SpectroFood_dataset.csv, contains hyperspectral measurements for various food items, including leek, apple, broccoli, and mushrooms. Each row represents a sample, with columns indicating:

Sample_ID: Unique identifier for the sample (L1, M1).
Dry_Matter_Content: The measured dry matter content (a continuous value).
Numerous columns representing light reflectance at specific wavelengths

Initial Loading and Filtering

The dataset was loaded using pandas. Initially, the project focused specifically on mushrooms samples, identified by M in their Sample_ID (M1, M2, etc.).

Column Renaming and Type Conversion

The first two columns were renamed to Sample_ID and Dry_Matter_Content.
All wavelength columns and Dry_Matter_Content were converted to numeric types. Non numeric values were coerced to NaN.

Multi-Class Definition

To transform the problem into a classification task, Dry_Matter_Content was categorized into five discrete classes based on predefined thresholds:

Class 1 (Very Unacceptable): Dry matter content < 0.2
Class 2 (Unacceptable): 0.2 <= Dry matter content < 0.4
Class 3 (Poor Quality): 0.4 <= Dry matter content < 0.6
Class 4 (Good Quality): 0.6 <= Dry matter content < 0.8
Class 5 (Excellent Quality): Dry matter content >= 0.8

A new column, Dry_Matter_Class, was created to store these classifications.

NaN Handling Strategy

An iterative approach was taken for handling missing values:

Mushroom-Only Dataset: Initially, rows with any NaN values in Dry_Matter_Content or wavelength columns were dropped. This resulted in a significant reduction in samples for the mushroom-only dataset.

Full Dataset (Revised): To retain more data, a revised strategy was adopted. NaN values in the wavelength columns were filled with 0 (assuming lack of signal). Rows were only dropped if Dry_Matter_Content or Dry_Matter_Class was NaN. This significantly increased the number of samples available for training.

Class Distribution (Full Dataset)

After comprehensive data cleaning and multi-class assignment on the full dataset, the distribution of Dry_Matter_Class was observed to be highly imbalanced:

Class 1: 932 samples
Class 2: 43 samples
Class 3: 2 samples
Class 4: 1 sample
Class 5: 50 samples

This severe imbalance, particularly the dominance of Class 1 and the scarcity of samples in Classes 3 and 4, presents a significant challenge for model training.


Scatter Plots

Scatter plots visualizing Dry_Matter_Content against various wavelength columns were generated. These plots revealed complex relationships, suggesting non-linear patterns and the presence of outliers (e.g., specific clusters of data points at high dry matter content). The visual trends indicated potential correlations but also highlighted the need for robust models that can capture intricate dependencies.

Dry Matter Content Distribution

A histogram of the Dry_Matter_Content in mushroom samples (after filtering) showed a bimodal distribution, with a high frequency in the 0-0.4 range and another peak in the 0.8-0.9 range. This reinforced the observation of class imbalance and explained the concentration of samples in Class 1 and Class 5.

Pearson Correlation Analysis

The Pearson correlation coefficient was calculated between Dry_Matter_Content and each wavelength column for mushroom samples. Key findings included:

Strong Negative Correlations: Wavelengths in the lower range (around 400-430 nm) showed strong negative correlations (e.g., -0.67). This suggests that as light reflectance increases in these bands, dry matter content decreases, possibly indicating water absorption bands.
Moderate Negative Correlations: Other regions (around 900-950 nm) showed moderate negative correlations (e.g., -0.43 to -0.46).
These correlations suggest that hyperspectral imaging has predictive potential for dry matter content, with specific spectral regions being more informative.

Dimensionality Reduction (PCA)

Principal Component Analysis (PCA) was applied to the spectral features of the mushroom-only dataset to reduce dimensionality and visualize class separation.

2D PCA: Visualizing the data in 2D (PC1 vs. PC2) showed some separation between Class 5 (high dry matter) and Class 1 (low dry matter), but significant overlap remained, indicating a non-linear dataset.
3D PCA: Extending the visualization to 3D (PC1, PC2, PC3) further revealed the data distribution, but the classes still exhibited considerable overlap, confirming the non-linear and complex nature of the relationships.

PCA helped in understanding the underlying structure of the data and confirmed that a simple linear model would likely be insufficient for accurate classification.

Machine Learning Models

Baseline CNN Model (Mushroom-Only Training and Evaluation)

An initial 1D CNN model was developed and evaluated on the mushroom only dataset.

Data Preparation: Features (X) and target (y) were separated, split into 70% training and 30% testing sets. Features were standardized using StandardScaler, and reshaped to (samples, timesteps, features) for the 1D CNN. The target variable (Dry_Matter_Class) was one-hot encoded.
CNN Architecture: A sequential model with two Conv1D layers (32 and 64 filters, kernel size 3, ReLU activation), a Flatten layer, and two Dense layers (100 units with ReLU, and a final output layer with 5 units and softmax activation) was used.
Compilation and Training: The model was compiled with the Adam optimizer (learning_rate=0.001) and categorical_crossentropy loss. It was trained for 10 epochs with a batch size of 12 and a 20% validation split.
Evaluation: The model achieved an overall accuracy of 0.68 on the mushroom-only test data. Classes 0 and 4 were classified relatively well (F1-scores ~0.77), but performance on classes 1, 2, and 3 was very poor (F1-scores near 0), primarily due to severe class imbalance.

Fine tuning Strategy: Full Dataset Training & Mushroom Only Evaluation

Recognizing the limitations imposed by class imbalance in the mushroom-only dataset, a fine-tuning strategy was implemented:

Training on Full Dataset (df_full_cleaned): The CNN model (with the same architecture) was trained on the entire df_full_cleaned dataset (all food types). This was done to leverage a broader knowledge base and potentially learn more generalized spectral patterns related to dry matter content across different biological samples. The training data (X_train_reshaped_full, y_train_one_hot_full) from this full dataset was used.
Evaluation on Mushroom-Only Test Set: The trained model was then specifically evaluated on the pre-prepared mushroom-only test set (X_test_reshaped, y_test_one_hot).
Input Shape Adjustment: A key step was addressing a shape mismatch: the model expected 421 timesteps (from training on the full dataset), but the mushroom-only test data had only 204. The mushroom test data was padded with zeros to match the required input shape of the trained model.
Training Details: The model was trained for 50 epochs with a batch size of 32.
Evaluation Results: The model achieved an overall accuracy of 0.52 on the mushroom-only test set. This was a decrease from the baseline model trained only on mushrooms. Performance for classes 1, 2, 3, and 4 remained extremely poor (0.00 precision, recall, F1-scores), with the model overwhelmingly predicting the majority Class 0.

Conclusion & Future Work

The experiments highlight the significant challenge posed by class imbalance in the SpectroFood_dataset.csv. While hyperspectral imaging shows promise for dry matter content prediction, and even with increased data (full dataset training), the model struggles to learn the minority classes when evaluated on a specific, imbalanced subset like mushrooms. The approach of training on a broader dataset did not inherently resolve the class imbalance issues for the mushroom-only evaluation.

Key Takeaways:

Hyperspectral data has potential for dry matter content prediction.
Severe class imbalance heavily biases model predictions towards the majority class.
Training on a general dataset doesn't automatically improve performance on specific, imbalanced subsets.


Dependencies

pandas
numpy
matplotlib
seaborn
scikit-learn
tensorflow (Keras)