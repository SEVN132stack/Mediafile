<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;

class RadarrService
{
    private function call(string $method, string $endpoint, array $body = []): array
    {
        $url = Setting::get('radarr_url');
        $key = Setting::get('radarr_api_key');
        if (!$url || !$key) throw new \Exception('Radarr niet geconfigureerd');

        $req = Http::timeout(15)->withHeaders(['X-Api-Key' => $key]);
        $response = match ($method) {
            'GET'    => $req->get("{$url}/api/v3{$endpoint}"),
            'POST'   => $req->post("{$url}/api/v3{$endpoint}", $body),
            'PUT'    => $req->put("{$url}/api/v3{$endpoint}", $body),
            default  => throw new \Exception("Ongeldig method: {$method}"),
        };

        if (!$response->ok()) throw new \Exception("Radarr {$response->status()}: " . substr($response->body(), 0, 200));
        return $response->json();
    }

    public function testConnection(): bool
    {
        try { $this->call('GET', '/system/status'); return true; } catch (\Exception) { return false; }
    }

    public function qualityProfiles(): array { return $this->call('GET', '/qualityprofile'); }
    public function rootFolders(): array     { return $this->call('GET', '/rootfolder'); }

    public function sendMovie(int $tmdbId, string $title): array
    {
        // Check of film al bestaat
        try {
            $existing = $this->call('GET', "/movie?tmdbId={$tmdbId}");
            if (!empty($existing)) {
                $m = $existing[0];
                if ($m['hasFile']) return ['status' => 'available', 'message' => 'Film al beschikbaar', 'radarr_id' => $m['id']];
                return ['status' => 'downloading', 'message' => 'Film wordt gedownload', 'radarr_id' => $m['id']];
            }
        } catch (\Exception) {}

        $profileId = (int) Setting::get('radarr_quality_profile') ?: null;
        $rootFolder = Setting::get('radarr_root_folder') ?: null;

        if (!$profileId) {
            $profiles = $this->call('GET', '/qualityprofile');
            $profileId = $profiles[0]['id'] ?? null;
        }
        if (!$rootFolder) {
            $folders = $this->call('GET', '/rootfolder');
            $rootFolder = $folders[0]['path'] ?? null;
        }

        $movie = $this->call('POST', '/movie', [
            'tmdbId'           => $tmdbId,
            'title'            => $title,
            'qualityProfileId' => $profileId,
            'rootFolderPath'   => $rootFolder,
            'monitored'        => true,
            'addOptions'       => ['searchForMovie' => true],
        ]);

        return ['status' => 'sent', 'message' => 'Film naar Radarr gestuurd — download gestart', 'radarr_id' => $movie['id']];
    }
}
