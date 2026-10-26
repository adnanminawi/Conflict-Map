-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 26, 2026 at 12:00 PM
-- Server version: 8.0.46
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `conflict_map`
--

-- --------------------------------------------------------

--
-- Table structure for table `admins`
--

CREATE TABLE `admins` (
  `id` int UNSIGNED NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `admins`
--

INSERT INTO `admins` (`id`, `username`, `password_hash`) VALUES
(1, 'test', '1'),
(2, 'adnan', '$2b$10$k2DwNUmFWl9ItfGs5cIOiemf/bSGq.w0FnC4rYdn95Iu1JZvclkIq');

-- --------------------------------------------------------

--
-- Table structure for table `alerts`
--

CREATE TABLE `alerts` (
  `id` bigint UNSIGNED NOT NULL,
  `external_id` varchar(64) NOT NULL,
  `alert_type_id` smallint UNSIGNED NOT NULL,
  `started_at` datetime(3) NOT NULL,
  `ended_at` datetime(3) DEFAULT NULL,
  `raw_payload` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `alert_areas`
--

CREATE TABLE `alert_areas` (
  `id` int UNSIGNED NOT NULL,
  `feed_name` varchar(150) NOT NULL,
  `name_en` varchar(150) DEFAULT NULL,
  `geom` geometry NOT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `alert_area_links`
--

CREATE TABLE `alert_area_links` (
  `alert_id` bigint UNSIGNED NOT NULL,
  `alert_area_id` int UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `alert_types`
--

CREATE TABLE `alert_types` (
  `id` smallint UNSIGNED NOT NULL,
  `feed_code` varchar(40) NOT NULL,
  `name` varchar(100) NOT NULL,
  `icon` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `events`
--

CREATE TABLE `events` (
  `id` bigint UNSIGNED NOT NULL,
  `event_type_id` smallint UNSIGNED NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `occurred_at` datetime(3) NOT NULL,
  `geom` point NOT NULL
) ;

--
-- Dumping data for table `events`
--

INSERT INTO `events` (`id`, `event_type_id`, `title`, `description`, `occurred_at`, `geom`, `location_id`, `status`, `created_by`, `created_at`, `updated_at`) VALUES
(2, 1, 'Strike near Bandar Abbas port', NULL, '2026-10-25 09:00:00.000', 0xe61000000101000000c3f5285c8f224c40ae47e17a142e3b40, NULL, 'confirmed', 1, '2026-10-25 12:15:43.108', '2026-10-25 12:15:43.108'),
(3, 4, 'Strike', NULL, '2026-10-25 00:30:00.000', 0xe610000001010000001d38674469a34b401ef98381e7363940, NULL, 'unverified', 2, '2026-10-26 10:28:09.985', '2026-10-26 10:28:09.985'),
(4, 2, 'Strike', NULL, '2026-10-26 10:28:00.000', 0xe610000001010000001d38674469a34b401ef98381e7363940, NULL, 'confirmed', 2, '2026-10-26 10:28:47.540', '2026-10-26 10:28:47.540'),
(5, 1, 'Strike', NULL, '2026-10-25 03:41:00.000', 0xe6100000010100000005a3923a016d41407958a835cd0b3f40, NULL, 'confirmed', 2, '2026-10-26 10:37:38.878', '2026-10-26 10:37:38.878'),
(6, 6, 'Strike', NULL, '2026-10-25 01:45:00.000', 0xe6100000010100000039d6c56d34c0414027c286a757f24040, NULL, 'confirmed', 2, '2026-10-26 10:45:34.340', '2026-10-26 10:45:34.340');

-- --------------------------------------------------------

--
-- Table structure for table `event_news`
--

CREATE TABLE `event_news` (
  `event_id` bigint UNSIGNED NOT NULL,
  `news_id` bigint UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `event_types`
--

CREATE TABLE `event_types` (
  `id` smallint UNSIGNED NOT NULL,
  `code` varchar(40) NOT NULL,
  `name` varchar(100) NOT NULL,
  `icon` varchar(100) NOT NULL,
  `color` char(7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `event_types`
--

INSERT INTO `event_types` (`id`, `code`, `name`, `icon`, `color`) VALUES
(1, 'missile_strike', 'Missile strike', 'missile', '#E53935'),
(2, 'drone_strike', 'Drone strike', 'drone', '#FB8C00'),
(3, 'airstrike', 'Airstrike', 'jet', '#8E24AA'),
(4, 'interception', 'Interception', 'shield', '#1E88E5'),
(5, 'naval_incident', 'Naval incident', 'ship', '#00897B'),
(6, 'explosion', 'Explosion', 'explosion', '#6D4C41');

-- --------------------------------------------------------

--
-- Table structure for table `locations`
--

CREATE TABLE `locations` (
  `id` int UNSIGNED NOT NULL,
  `location_type_id` smallint UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `country_code` char(2) NOT NULL,
  `geom` point NOT NULL
) ;

--
-- Dumping data for table `locations`
--

INSERT INTO `locations` (`id`, `location_type_id`, `name`, `country_code`, `geom`, `description`) VALUES
(1, 2, 'Imam Khomeini International Airport', 'IR', 0xe61000000101000000fa7e6abc749349406891ed7c3fb54140, NULL),
(2, 2, 'Shiraz International Airport', 'IR', 0xe6100000010100000008ac1c5a644b4a40448b6ce7fb893d40, NULL),
(3, 2, 'Bandar Abbas International Airport', 'IR', 0xe61000000101000000aaf1d24d62304c402b8716d9ce373b40, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `location_types`
--

CREATE TABLE `location_types` (
  `id` smallint UNSIGNED NOT NULL,
  `code` varchar(40) NOT NULL,
  `name` varchar(100) NOT NULL,
  `icon` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `location_types`
--

INSERT INTO `location_types` (`id`, `code`, `name`, `icon`) VALUES
(1, 'military_base', 'Military base', 'base'),
(2, 'airport', 'Airport', 'airport'),
(3, 'naval_base', 'Naval base', 'anchor');

-- --------------------------------------------------------

--
-- Table structure for table `news`
--

CREATE TABLE `news` (
  `id` bigint UNSIGNED NOT NULL,
  `title` varchar(300) NOT NULL,
  `summary` text NOT NULL,
  `url` varchar(700) DEFAULT NULL,
  `source_name` varchar(150) NOT NULL,
  `published_at` datetime(3) NOT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `created_by` int UNSIGNED NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admins`
--
ALTER TABLE `admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `alerts`
--
ALTER TABLE `alerts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `external_id` (`external_id`),
  ADD KEY `idx_alerts_started` (`started_at`),
  ADD KEY `fk_alerts_type` (`alert_type_id`);

--
-- Indexes for table `alert_area_links`
--
ALTER TABLE `alert_area_links`
  ADD PRIMARY KEY (`alert_id`,`alert_area_id`),
  ADD KEY `fk_aal_area` (`alert_area_id`);

--
-- Indexes for table `alert_types`
--
ALTER TABLE `alert_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `feed_code` (`feed_code`);

--
-- Indexes for table `event_news`
--
ALTER TABLE `event_news`
  ADD PRIMARY KEY (`event_id`,`news_id`),
  ADD KEY `fk_en_news` (`news_id`);

--
-- Indexes for table `event_types`
--
ALTER TABLE `event_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `location_types`
--
ALTER TABLE `location_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `news`
--
ALTER TABLE `news`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `url` (`url`),
  ADD KEY `idx_news_published` (`published_at`),
  ADD KEY `fk_news_created_by` (`created_by`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admins`
--
ALTER TABLE `admins`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `alerts`
--
ALTER TABLE `alerts`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `alert_areas`
--
ALTER TABLE `alert_areas`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `alert_types`
--
ALTER TABLE `alert_types`
  MODIFY `id` smallint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `events`
--
ALTER TABLE `events`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `event_types`
--
ALTER TABLE `event_types`
  MODIFY `id` smallint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `location_types`
--
ALTER TABLE `location_types`
  MODIFY `id` smallint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `news`
--
ALTER TABLE `news`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `alerts`
--
ALTER TABLE `alerts`
  ADD CONSTRAINT `fk_alerts_type` FOREIGN KEY (`alert_type_id`) REFERENCES `alert_types` (`id`);

--
-- Constraints for table `alert_area_links`
--
ALTER TABLE `alert_area_links`
  ADD CONSTRAINT `fk_aal_alert` FOREIGN KEY (`alert_id`) REFERENCES `alerts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_aal_area` FOREIGN KEY (`alert_area_id`) REFERENCES `alert_areas` (`id`);

--
-- Constraints for table `event_news`
--
ALTER TABLE `event_news`
  ADD CONSTRAINT `fk_en_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_en_news` FOREIGN KEY (`news_id`) REFERENCES `news` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `news`
--
ALTER TABLE `news`
  ADD CONSTRAINT `fk_news_created_by` FOREIGN KEY (`created_by`) REFERENCES `admins` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
