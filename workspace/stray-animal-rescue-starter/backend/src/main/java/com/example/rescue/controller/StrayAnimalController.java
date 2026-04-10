package com.example.rescue.controller;

import com.example.rescue.entity.StrayAnimal;
import com.example.rescue.service.StrayAnimalService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/animals")
public class StrayAnimalController {

    private final StrayAnimalService strayAnimalService;

    public StrayAnimalController(StrayAnimalService strayAnimalService) {
        this.strayAnimalService = strayAnimalService;
    }

    @GetMapping
    public List<StrayAnimal> list() {
        return strayAnimalService.listAll();
    }

    @PostMapping
    public StrayAnimal save(@RequestBody StrayAnimal strayAnimal) {
        return strayAnimalService.save(strayAnimal);
    }
}
